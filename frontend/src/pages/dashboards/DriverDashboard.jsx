import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from "../../config";
import { useNavigate } from 'react-router-dom';
import { acceptRide, driverArrived, verifyOtp, getActiveRide, completeRide } from "../../api/ride.api";

// ✅ Connect to Backend
const socket = io(SOCKET_URL);

export default function DriverDashboard() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const myMarkerRef = useRef(null);
  const navigate = useNavigate();

  // Maps Routing Refs
  const googleClassesRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  // --- DRIVER LIFECYCLE STATE MACHINE ---
  // ONLINE -> INCOMING_REQUEST -> ACCEPTED -> ARRIVED -> EN_ROUTE
  const [driverState, setDriverState] = useState("ONLINE");
  const [incomingRide, setIncomingRide] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [otpInput, setOtpInput] = useState("");

  // --- STATE RECOVERY ON MOUNT ---
  useEffect(() => {
    const fetchActiveRide = async () => {
      try {
        const res = await getActiveRide();
        if (res.data && res.data.ride) {
           const { ride } = res.data;
           const rehydratedRidePayload = {
              rideId: ride._id, 
              pickup: ride.pickupLocation, 
              drop: ride.dropLocation, 
              fareAmount: ride.fareAmount 
           };
           
           setActiveRide(rehydratedRidePayload);

           if (ride.rideStatus === "driver_assigned") {
               setDriverState("ACCEPTED");
           } else if (ride.rideStatus === "driver_arrived") {
               setDriverState("ARRIVED");
           } else if (ride.rideStatus === "ride_started") {
               setDriverState("EN_ROUTE");
           }
        }
      } catch (err) {
        console.error("Failed to fetch active driver ride", err);
      }
    };
    fetchActiveRide();
  }, []);

  // Map Drawing logic isolated to re-fire on state hydrations
  useEffect(() => {
     if (activeRide && directionsServiceRef.current && myMarkerRef.current && myMarkerRef.current.position) {
         if (driverState === "ACCEPTED") {
            const driverPos = myMarkerRef.current.position;
            const lat = typeof driverPos.lat === "function" ? driverPos.lat() : driverPos.lat;
            const lng = typeof driverPos.lng === "function" ? driverPos.lng() : driverPos.lng;
            const [destLng, destLat] = activeRide.pickup.coordinates;
            calculateRoute(lat, lng, destLat, destLng);
         } else if (driverState === "EN_ROUTE") {
            const [pickupLng, pickupLat] = activeRide.pickup.coordinates;
            const [dropLng, dropLat] = activeRide.drop.coordinates;
            calculateRoute(pickupLat, pickupLng, dropLat, dropLng);
         }
     }
  }, [driverState, activeRide]);

  useEffect(() => {
    const initMap = async () => {
      if (!window.google) return;

      try {
        const { Map } = await window.google.maps.importLibrary("maps");
        const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
        const { DirectionsService, DirectionsRenderer } = await window.google.maps.importLibrary("routes");

        googleClassesRef.current = { Map, AdvancedMarkerElement, PinElement, DirectionsService, DirectionsRenderer };

        const initialPosition = { lat: 20.5937, lng: 78.9629 }; 

        if (mapRef.current && !mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            zoom: 15,
            center: initialPosition,
            mapId: "DEMO_MAP_ID",
            mapTypeId: "roadmap",
            disableDefaultUI: false,
          });

          directionsServiceRef.current = new DirectionsService();
          directionsRendererRef.current = new DirectionsRenderer({
            map: mapInstanceRef.current,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#000000",
              strokeWeight: 6,
              strokeOpacity: 0.8,
            }
          });

          startTracking();
          setupSocketListeners();
        }
      } catch (error) {
        console.error("Error loading Google Maps:", error);
      }
    };

    if (window.google) {
      initMap();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initMap();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      socket.off("ride-request");
      socket.off("ride-cancelled");
    };
  }, []);

  const setupSocketListeners = () => {
    const handleJoin = () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const userId = JSON.parse(atob(token.split(".")[1])).sub;
          socket.emit("join", { userId, role: "DRIVER" });
          
          // Also immediately push location using the last known map marker to bypass static GPS
          if (myMarkerRef.current && myMarkerRef.current.position) {
             const pos = myMarkerRef.current.position;
             // Google objects often need to be cleanly unwrapped
             const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
             const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
             socket.emit("send-location", { latitude: lat, longitude: lng, type: "driver" });
             socket.emit("update-location", { driverId: userId, latitude: lat, longitude: lng });
          }
        } catch (e) {}
      }
    };

    // Join immediately if already connected, and also on all future reconnects
    if (socket.connected) handleJoin();
    socket.on("connect", handleJoin);

    // LISTENING FOR NEW RIDES IN THE 5KM RADIUS
    socket.on("ride-request", (data) => {
      setIncomingRide(data);
      setDriverState("INCOMING_REQUEST");
    });

    socket.on("ride-cancelled", () => {
      setIncomingRide(null);
      setDriverState("ONLINE");
    });
  };

  const startTracking = () => {
    const token = localStorage.getItem("token");
    let driverId = null;
    if (token) {
      try { driverId = JSON.parse(atob(token.split(".")[1])).sub; } catch(e){}
    }

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;

          socket.emit("send-location", { latitude, longitude, type: 'driver' });
          
          if (driverId) {
            socket.emit("update-location", { driverId, latitude, longitude });
          }

          if (mapInstanceRef.current) {
            const pos = { lat: latitude, lng: longitude };
            
            // Re-center map if free-roaming
            if (driverState === "ONLINE") {
                mapInstanceRef.current.setCenter(pos);
            }

            const { AdvancedMarkerElement, PinElement } = googleClassesRef.current || {};
            if (AdvancedMarkerElement && !myMarkerRef.current) {
               const pin = new PinElement({ glyphText: "D", background: "#0F52BA", borderColor: "#00008B", glyphColor: "white" });
               myMarkerRef.current = new AdvancedMarkerElement({ position: pos, map: mapInstanceRef.current, title: "Me", content: pin });
            } else if (myMarkerRef.current) {
               myMarkerRef.current.position = pos;
            }
          }
        },
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
      );
    }
  };

  // --- ACTIONS ---

  const calculateRoute = (originLat, originLng, destLat, destLng) => {
    if (!directionsServiceRef.current) return;
    const request = {
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destLat, lng: destLng },
      travelMode: window.google.maps.TravelMode.DRIVING,
    };
    directionsServiceRef.current.route(request, (result, status) => {
      if (status === "OK") {
        directionsRendererRef.current.setDirections(result);
      } else {
        console.error("Google Maps Route calculation failed:", status);
      }
    });
  };

  const handleAcceptRide = async () => {
    try {
      await acceptRide(incomingRide.rideId);
      setActiveRide(incomingRide);
      setIncomingRide(null);
      setDriverState("ACCEPTED"); 
      
      // Plot route to passenger pickup! (Mongoose Coords: [lng, lat])
      if (myMarkerRef.current && myMarkerRef.current.position) {
          const driverPos = myMarkerRef.current.position;
          const [destLng, destLat] = incomingRide.pickup.coordinates;
          calculateRoute(driverPos.lat, driverPos.lng, destLat, destLng);
      }
    } catch (err) {
      alert(err.response?.data?.error || "Failed to accept ride. Maybe another driver beat you to it!");
      setIncomingRide(null);
      setDriverState("ONLINE");
    }
  };

  const handleArrived = async () => {
    try {
      if (!activeRide) return;
      await driverArrived(activeRide.rideId);
      setDriverState("ARRIVED");
    } catch (err) {
      alert("Failed to mark arrived");
    }
  };

  const handleVerifyOtp = async () => {
    try {
      if (!activeRide) return;
      await verifyOtp(activeRide.rideId, { otp: otpInput });
      setDriverState("EN_ROUTE");
      alert("OTP Verified. Trip started!");

      // Clear old route and plot route from Pickup to Dropoff!
      const [pickupLng, pickupLat] = activeRide.pickup.coordinates;
      const [dropLng, dropLat] = activeRide.drop.coordinates;
      calculateRoute(pickupLat, pickupLng, dropLat, dropLng);

    } catch (err) {
      alert(err.response?.data?.error || "Invalid OTP");
    }
  };

  const handleCompleteRide = async () => {
     try {
         if (!activeRide) return;
         await completeRide(activeRide.rideId);
         alert("Ride Completed Successfully! Payment Processed.");
         if (directionsRendererRef.current) {
             directionsRendererRef.current.setDirections({ routes: [] });
         }
         setDriverState("ONLINE");
         setActiveRide(null);
     } catch (err) {
         alert(err.response?.data?.error || "Failed to complete ride");
     }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      
      <button
        onClick={handleLogout}
        style={{
          position: 'absolute', top: '20px', right: '20px', zIndex: 1001,
          padding: '10px 20px', backgroundColor: '#ff4d4f', color: 'white', border: 'none',
          borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
      >
        Logout
      </button>

      {/* 🗺️ MAP CONTAINER */}
      <div id="map" ref={mapRef} style={{ position: "absolute", top: 0, left: 0, width: '100%', height: '100%', background: '#f0f0f0', zIndex: 1 }}></div>

      {/* 🟢 DRIVER STATE PANELS */}
      <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, width: '90%', maxWidth: '400px' }}>
        
        {driverState === "ONLINE" && (
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', textAlign: 'center' }}>
             <h2 style={{ margin: 0, color: '#333' }}>You are Online</h2>
             <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>Waiting for ride requests...</p>
             <div className="pulse" style={{ width: '50px', height: '50px', background: 'rgba(0, 200, 80, 0.2)', borderRadius: '50%', margin: '15px auto 0', border: '2px solid #00c850', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div style={{ width: '15px', height: '15px', background: '#00c850', borderRadius: '50%' }}></div>
             </div>
             <style>{`@keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 200, 80, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 200, 80, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 200, 80, 0); } } .pulse { animation: pulse 2s infinite; }`}</style>
          </div>
        )}

        {/* 🟡 INCOMING RIDE REQUEST MODAL */}
        {driverState === "INCOMING_REQUEST" && incomingRide && (
          <div style={{ background: '#000', color: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ margin: 0, fontSize: '22px' }}>New Ride Request!</h2>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00e676' }}>₹{incomingRide.fareAmount}</div>
             </div>
             
             <div style={{ background: '#222', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
               <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ marginRight: '10px' }}>🟢</div>
                  <div>{incomingRide.pickup.address}</div>
               </div>
               <div style={{ borderLeft: '2px solid #555', marginLeft: '6px', height: '10px', marginBottom: '10px' }}></div>
               <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{ marginRight: '10px' }}>📍</div>
                  <div>{incomingRide.drop.address}</div>
               </div>
             </div>
             
             <div style={{ display: 'flex', gap: '10px' }}>
               <button 
                 onClick={() => { setIncomingRide(null); setDriverState("ONLINE"); }}
                 style={{ flex: 1, padding: '15px', background: '#333', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                 Decline
               </button>
               <button 
                 onClick={handleAcceptRide}
                 style={{ flex: 2, padding: '15px', background: '#fff', color: 'black', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>
                 Accept Ride
               </button>
             </div>
          </div>
        )}

        {/* 🔵 RIDE ACCEPTED (NAVIGATING TO PICKUP) */}
        {driverState === "ACCEPTED" && activeRide && (
          <div style={{ background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#111', fontSize: '24px' }}>Heading to Pickup</h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#555' }}>Navigating to: <strong>{activeRide.pickup.address}</strong></p>
            <button 
              onClick={handleArrived}
              style={{ width: '100%', padding: '16px', background: '#000', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '18px' }}>
              Reached Pickup Point
            </button>
          </div>
        )}

        {/* 🟠 ARRIVED AT PICKUP (WAITING FOR OTP) */}
        {driverState === "ARRIVED" && (
          <div style={{ background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 5px 0', color: '#111' }}>You have arrived</h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#666' }}>Ask the passenger for the 6-digit OTP sent to their email.</p>
            
            <input 
               type="text" 
               placeholder="Enter OTP" 
               maxLength={6}
               value={otpInput}
               onChange={(e) => setOtpInput(e.target.value)}
               style={{ width: '100%', padding: '15px', fontSize: '20px', letterSpacing: '8px', textAlign: 'center', boxSizing: 'border-box', border: '2px solid #ddd', borderRadius: '8px', marginBottom: '15px', fontWeight: 'bold' }}
            />

            <button 
              onClick={handleVerifyOtp}
              style={{ width: '100%', padding: '15px', background: '#00c850', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>
              Verify OTP & Start Trip
            </button>
          </div>
        )}

        {/* 🟢 EN ROUTE TO DROP (TRIP ACTIVE) */}
        {driverState === "EN_ROUTE" && activeRide && (
          <div style={{ background: '#000', padding: '25px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', color: 'white' }}>
            <h2 style={{ margin: '0 0 5px 0', color: '#fff' }}>Trip Started</h2>
            <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#aaa' }}>Navigating to destination...</p>
            <div style={{ background: '#222', padding: '15px', borderRadius: '8px', fontSize: '14px', marginBottom: '20px' }}>
              <div>📍 {activeRide.drop.address}</div>
            </div>
            
            <button 
              onClick={handleCompleteRide}
              style={{ width: '100%', padding: '16px', background: '#00c850', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>
              Complete Ride
            </button>
          </div>
        )}

      </div>
    </div>
  );
}