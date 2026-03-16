import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from "../../config";
import { useNavigate } from 'react-router-dom';
import { bookRide } from "../../api/ride.api";

// ✅ Connect to Backend
const socket = io(SOCKET_URL);

export default function UserDashboard() {
  // Map & Logic Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const googleClassesRef = useRef(null);
  const navigate = useNavigate();

  // Search & Routing Refs
  const pickupInputRef = useRef(null);
  const dropInputRef = useRef(null);
  const pickupAutocompleteRef = useRef(null);
  const dropAutocompleteRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  // --- RIDE LIFECYCLE STATE MACHINE --- //
  // IDLE -> ROUTE_PREVIEW -> WAITING_FOR_DRIVER -> DRIVER_ASSIGNED -> DRIVER_ARRIVED -> RIDE_STARTED
  const [rideState, setRideState] = useState("IDLE");
  const [routeDetails, setRouteDetails] = useState(null);
  const [fareAmount, setFareAmount] = useState(0);
  const [assignedDriver, setAssignedDriver] = useState(null);
  const [currentRideId, setCurrentRideId] = useState(null);
  const [currentRidePayload, setCurrentRidePayload] = useState(null);

  // Auto-retry polling when waiting for a driver
  useEffect(() => {
    let interval;
    if (rideState === "WAITING_FOR_DRIVER" && currentRideId && currentRidePayload) {
      interval = setInterval(() => {
        socket.emit("retry-match", {
          rideId: currentRideId,
          ...currentRidePayload,
          fareAmount
        });
      }, 5000); // Poll every 5 seconds
    }
    return () => clearInterval(interval);
  }, [rideState, currentRideId, currentRidePayload, fareAmount]);

  useEffect(() => {
    const initMap = async () => {
      if (!window.google) return;

      try {
        const { Map } = await window.google.maps.importLibrary("maps");
        const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
        const { Autocomplete } = await window.google.maps.importLibrary("places");
        const { DirectionsService, DirectionsRenderer } = await window.google.maps.importLibrary("routes");

        googleClassesRef.current = { Map, AdvancedMarkerElement, PinElement, DirectionsService, DirectionsRenderer };

        const initialPosition = { lat: 20.5937, lng: 78.9629 }; 

        if (mapRef.current && !mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            zoom: 5,
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

          initAutocomplete(Autocomplete);
          setupSocketListeners();
          startTracking();
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
      socket.off("receive-location");
      socket.off("user-disconnected");
      socket.off("ride-accepted");
      socket.off("driver-arrived");
      socket.off("ride-started");
    };
  }, []);

  const initAutocomplete = (AutocompleteClass) => {
    if (!pickupInputRef.current || !dropInputRef.current) return;
    const options = { fields: ["geometry", "name", "formatted_address"], types: ["geocode", "establishment"] };
    pickupAutocompleteRef.current = new AutocompleteClass(pickupInputRef.current, options);
    dropAutocompleteRef.current = new AutocompleteClass(dropInputRef.current, options);
  };

  const handleGetRoute = () => {
    if (!directionsServiceRef.current) return;
    const pickupPlace = pickupAutocompleteRef.current?.getPlace();
    const dropPlace = dropAutocompleteRef.current?.getPlace();

    if (!pickupPlace?.geometry || !dropPlace?.geometry) {
      alert("Please select valid locations from the dropdown suggestions.");
      return;
    }

    const request = {
      origin: pickupPlace.geometry.location,
      destination: dropPlace.geometry.location,
      travelMode: window.google.maps.TravelMode.DRIVING,
    };

    directionsServiceRef.current.route(request, (result, status) => {
      if (status === "OK") {
        directionsRendererRef.current.setDirections(result);
        const leg = result.routes[0].legs[0];
        const distanceKm = leg.distance.value / 1000;
        
        // ₹10 per 2 km -> ₹5 per km rounded
        const computedFare = Math.round(distanceKm * 5);
        setFareAmount(computedFare);
        
        setRouteDetails({ 
          distance: leg.distance.text, 
          duration: leg.duration.text,
          distanceKm 
        });
        setRideState("ROUTE_PREVIEW");
      } else {
        alert("Route calculation failed: " + status);
      }
    });
  };

  const handleBookRide = async () => {
    try {
      const pickupPlace = pickupAutocompleteRef.current?.getPlace();
      const dropPlace = dropAutocompleteRef.current?.getPlace();
      
      const payload = {
        pickup: {
          address: pickupPlace.formatted_address || pickupPlace.name,
          coordinates: [pickupPlace.geometry.location.lng(), pickupPlace.geometry.location.lat()]
        },
        drop: {
          address: dropPlace.formatted_address || dropPlace.name,
          coordinates: [dropPlace.geometry.location.lng(), dropPlace.geometry.location.lat()]
        },
        distanceKm: routeDetails.distanceKm
      };

      setCurrentRidePayload(payload);
      const res = await bookRide(payload);
      setCurrentRideId(res.data.rideId);
      setRideState("WAITING_FOR_DRIVER");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to book ride");
    }
  };

  const handleCancelSearch = () => {
    setRideState("IDLE");
    setCurrentRideId(null);
    setCurrentRidePayload(null);
    setRouteDetails(null);
    setFareAmount(0);
    if (directionsRendererRef.current) {
        directionsRendererRef.current.setDirections({ routes: [] });
    }
  };

  const setupSocketListeners = () => {
    const handleJoin = () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const userId = JSON.parse(atob(token.split(".")[1])).sub;
          socket.emit("join", { userId, role: "USER" });
        } catch (e) {}
      }
    };

    if (socket.connected) handleJoin();
    socket.on("connect", handleJoin);

    socket.on("receive-location", (data) => {
      const { AdvancedMarkerElement, PinElement } = googleClassesRef.current || {};
      if (!AdvancedMarkerElement) return;

      const { id, latitude, longitude, type } = data;
      if (type === 'driver') {
        const position = { lat: Number(latitude), lng: Number(longitude) };
        if (markersRef.current[id]) {
          markersRef.current[id].position = position;
        } else {
           if (mapInstanceRef.current) {
             const pin = new PinElement({ glyphText: "D", background: "#0F52BA", borderColor: "#00008B", glyphColor: "white" });
             markersRef.current[id] = new AdvancedMarkerElement({
               position, map: mapInstanceRef.current, title: "Driver", content: pin
             });
           }
        }
      }
    });

    socket.on("user-disconnected", (id) => {
      if (markersRef.current[id]) {
        markersRef.current[id].map = null;
        delete markersRef.current[id];
      }
    });

    // --- RIDE SOCKET LIFECYCLES ---
    socket.on("ride-accepted", (data) => {
      setAssignedDriver(data.driver);
      setCurrentRideId(data.rideId);
      setRideState("DRIVER_ASSIGNED");
    });

    socket.on("driver-arrived", () => {
      setRideState("DRIVER_ARRIVED");
    });

    socket.on("ride-started", () => {
      setRideState("RIDE_STARTED");
    });
  };

  const startTracking = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { AdvancedMarkerElement, PinElement } = googleClassesRef.current || {};
          if (!AdvancedMarkerElement) return;
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };

          if (mapInstanceRef.current) {
             if (!markersRef.current['me']) {
               mapInstanceRef.current.setCenter(pos);
               mapInstanceRef.current.setZoom(15);
               const pin = new PinElement({ glyphText: "U", background: "black", borderColor: "black", glyphColor: "white" });
               markersRef.current['me'] = new AdvancedMarkerElement({ position: pos, map: mapInstanceRef.current, title: "You", content: pin });
             } else {
               markersRef.current['me'].position = pos;
             }
          }
        },
        (error) => console.error("GPS Error:", error),
        { enableHighAccuracy: true }
      );
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      
      {/* 🔴 LOGOUT BUTTON */}
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

      {/* 🗺️ MAP CONTAINER: 100% height background */}
      <div id="map" ref={mapRef} style={{ position: "absolute", top: 0, left: 0, width: '100%', height: '100%', background: '#f0f0f0', zIndex: 1 }}></div>

      {/* 🟢 DYNAMIC FLOATING PANEL based on State */}
      <div style={{
        position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, backgroundColor: 'white', padding: '25px', borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)', width: '90%', maxWidth: '450px',
        display: 'flex', flexDirection: 'column', gap: '15px'
      }}>
        
        {/* PHASE: IDLE / ROUTE_PREVIEW (Search Box) */}
        {(rideState === "IDLE" || rideState === "ROUTE_PREVIEW") && (
          <>
            <h2 style={{ margin: 0, color: '#111', fontSize: '22px', fontWeight: 'bold' }}>Where to?</h2>
            
            <input 
              ref={pickupInputRef} 
              type="text" 
              placeholder="Current Location" 
              style={{ padding: '14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', color: '#333', background: '#f8f8f8' }}
            />
            
            <input 
              ref={dropInputRef} 
              type="text" 
              placeholder="Destination" 
              style={{ padding: '14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', color: '#333', background: '#f8f8f8' }}
            />

            {rideState === "IDLE" ? (
              <button onClick={handleGetRoute} style={{ padding: '15px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '5px' }}>
                Search Ride
              </button>
            ) : (
              <button onClick={handleBookRide} style={{ padding: '15px', backgroundColor: '#000000', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Confirm Booking</span>
                <span>₹{fareAmount}</span>
              </button>
            )}
            
            {routeDetails && (
              <div style={{ textAlign: 'center', fontSize: '13px', color: '#666', marginTop: '-5px' }}>
                Distance: {routeDetails.distance} • Est. Time: {routeDetails.duration}
              </div>
            )}
          </>
        )}

        {/* PHASE: WAITING_FOR_DRIVER */}
        {rideState === "WAITING_FOR_DRIVER" && (
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <div className="spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #000', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 15px' }}></div>
            <h3 style={{ margin: '0 0 5px 0' }}>Requesting Ride...</h3>
            <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px' }}>Connecting you to drivers within 5km.</p>
            <button onClick={handleCancelSearch} style={{ width: '100%', padding: '15px', backgroundColor: '#ff4d4f', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>Cancel Search</button>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* PHASE: DRIVER_ASSIGNED */}
        {rideState === "DRIVER_ASSIGNED" && assignedDriver && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Driver is En Route</h2>
              <span style={{ background: '#f0f0f0', padding: '4px 8px', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}>⭐ {assignedDriver.rating}</span>
            </div>
            
            <div style={{ background: '#f8f8f8', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: '16px' }}>{assignedDriver.fullName}</p>
              <p style={{ margin: '0', color: '#555', fontSize: '14px' }}>{assignedDriver.vehicle?.brand} {assignedDriver.vehicle?.model} • {assignedDriver.vehicle?.rcNumber}</p>
            </div>
            
            <p style={{ margin: 0, color: '#666', fontSize: '13px', textAlign: 'center' }}>Please wait at the pickup point.</p>
          </div>
        )}

        {/* PHASE: DRIVER_ARRIVED */}
        {rideState === "DRIVER_ARRIVED" && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📍</div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '22px' }}>Your driver has arrived!</h2>
            <p style={{ margin: '0 0 15px 0', color: '#555', fontSize: '15px' }}>For your safety, please check your email for the 6-digit OTP and provide it to the driver to start the trip.</p>
            <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}>
              Do not start the ride until OTP is verified.
            </div>
          </div>
        )}

        {/* PHASE: RIDE_STARTED */}
        {rideState === "RIDE_STARTED" && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🚗</div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '22px' }}>You are on your way!</h2>
            <p style={{ margin: '0', color: '#555', fontSize: '15px' }}>Enjoy your ride to {dropInputRef.current?.value}.</p>
          </div>
        )}

      </div>
    </div>
  );
}