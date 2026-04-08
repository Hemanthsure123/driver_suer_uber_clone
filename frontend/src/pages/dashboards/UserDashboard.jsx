import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from "../../config";
import { useNavigate } from 'react-router-dom';
import { bookRide, getActiveRide, resendOtp } from "../../api/ride.api";

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
  const geocoderRef = useRef(null);

  // --- RIDE LIFECYCLE STATE MACHINE --- //
  // IDLE -> ROUTE_PREVIEW -> WAITING_FOR_DRIVER -> DRIVER_ASSIGNED -> DRIVER_ARRIVED -> RIDE_STARTED
  const [rideState, setRideState] = useState("IDLE");
  const [routeDetails, setRouteDetails] = useState(null);
  const [fareAmount, setFareAmount] = useState(0);
  const [assignedDriver, setAssignedDriver] = useState(null);
  const [currentRideId, setCurrentRideId] = useState(null);
  const [currentRidePayload, setCurrentRidePayload] = useState(null);
  const [otpFromSocket, setOtpFromSocket] = useState(null); // OTP delivered via socket when email fails
  const [isOtpResending, setIsOtpResending] = useState(false);

  // Live Location & Map Interaction States
  const [manualPickup, setManualPickup] = useState(null);
  const [manualDrop, setManualDrop] = useState(null);
  const [isSelectingDropMap, setIsSelectingDropMap] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // --- STATE RECOVERY ON MOUNT ---
  useEffect(() => {
    const fetchActiveRide = async () => {
      try {
        const res = await getActiveRide();
        if (res.data && res.data.ride) {
          const { ride, driver, otpRequired } = res.data;
          setCurrentRideId(ride._id);
          setFareAmount(ride.fareAmount);
          
          if (ride.rideStatus === "requested") {
            setRideState("WAITING_FOR_DRIVER");
          } else if (ride.rideStatus === "driver_assigned") {
            setAssignedDriver(driver || assignedDriver);
            setRideState("DRIVER_ASSIGNED");
          } else if (ride.rideStatus === "driver_arrived") {
            setAssignedDriver(driver || assignedDriver);
            setRideState("DRIVER_ARRIVED");
            if (otpRequired) {
              setOtpFromSocket(null); 
            } else if (ride.otpCode) {
              setOtpFromSocket(ride.otpCode);
            }
          } else if (ride.rideStatus === "ride_started") {
             setRideState("RIDE_STARTED");
          }

          if (ride.pickupLocation && ride.dropLocation && pickupInputRef.current && dropInputRef.current) {
             pickupInputRef.current.value = ride.pickupLocation.address;
             dropInputRef.current.value = ride.dropLocation.address;
          }
        }
      } catch (err) {
        console.error("Failed to recover ride state:", err);
      }
    };
    fetchActiveRide();
  }, []);

  const handleResendOtp = async () => {
     if (!currentRideId) return;
     setIsOtpResending(true);
     try {
        await resendOtp(currentRideId);
        alert("OTP sent to your registered email address.");
     } catch (err) {
        alert("Failed to resend OTP. Check connection.");
     } finally {
        setIsOtpResending(false);
     }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            setIsLocating(false);
            if (status === "OK" && results[0]) {
              const address = results[0].formatted_address;
              if (pickupInputRef.current) {
                pickupInputRef.current.value = address;
              }
              const locationObj = { address, coordinates: [longitude, latitude], lat: latitude, lng: longitude };
              setManualPickup(locationObj);
              
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setCenter({ lat: latitude, lng: longitude });
                mapInstanceRef.current.setZoom(15);
              }
            } else {
              alert("Could not determine address from location");
            }
          });
        }
      },
      (error) => {
        setIsLocating(false);
        alert("Location permission denied or failed to fetch: " + error.message);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleOpenMapSelection = () => {
    setIsSelectingDropMap(true);
  };

  const handleConfirmDropMap = () => {
    if (!mapInstanceRef.current || !geocoderRef.current) return;
    setIsLocating(true);
    const center = mapInstanceRef.current.getCenter();
    // Safely unwrap Google maps functions if present
    const lat = typeof center.lat === "function" ? center.lat() : center.lat;
    const lng = typeof center.lng === "function" ? center.lng() : center.lng;

    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      setIsLocating(false);
      if (status === "OK" && results[0]) {
        const address = results[0].formatted_address;
        if (dropInputRef.current) {
          dropInputRef.current.value = address;
        }
        const locationObj = { address, coordinates: [lng, lat], lat, lng };
        setManualDrop(locationObj);
        setIsSelectingDropMap(false);
      } else {
        alert("Could not determine address. Try moving the map slightly.");
      }
    });
  };

  useEffect(() => {
    const initMap = async () => {
      if (!window.google) return;

      try {
        const { Map } = await window.google.maps.importLibrary("maps");
        const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
        const { Autocomplete } = await window.google.maps.importLibrary("places");
        const { DirectionsService, DirectionsRenderer } = await window.google.maps.importLibrary("routes");
        const { Geocoder } = await window.google.maps.importLibrary("geocoding");

        googleClassesRef.current = { Map, AdvancedMarkerElement, PinElement, DirectionsService, DirectionsRenderer, Autocomplete };

        geocoderRef.current = new Geocoder();
        
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
    if (!pickupInputRef.current || !dropInputRef.current || !AutocompleteClass) return;
    const options = { fields: ["geometry", "name", "formatted_address"], types: ["geocode", "establishment"] };
    
    if (!pickupAutocompleteRef.current) {
       pickupAutocompleteRef.current = new AutocompleteClass(pickupInputRef.current, options);
       pickupAutocompleteRef.current.addListener("place_changed", () => setManualPickup(null));
    }
    if (!dropAutocompleteRef.current) {
       dropAutocompleteRef.current = new AutocompleteClass(dropInputRef.current, options);
       dropAutocompleteRef.current.addListener("place_changed", () => setManualDrop(null));
    }
  };

  // Helper normalizer
  const getLocationPayload = (manualState, autocompleteRef) => {
    if (manualState) return manualState;
    const place = autocompleteRef.current?.getPlace();
    if (!place || !place.geometry) return null;
    return {
      address: place.formatted_address || place.name,
      coordinates: [place.geometry.location.lng(), place.geometry.location.lat()],
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };
  };

  const handleGetRoute = () => {
    if (!directionsServiceRef.current) return;
    
    const pickupPayload = getLocationPayload(manualPickup, pickupAutocompleteRef);
    const dropPayload = getLocationPayload(manualDrop, dropAutocompleteRef);

    if (!pickupPayload || !dropPayload) {
      alert("Please select valid locations (or use the Map / Current Location buttons).");
      return;
    }

    const request = {
      origin: { lat: pickupPayload.lat, lng: pickupPayload.lng },
      destination: { lat: dropPayload.lat, lng: dropPayload.lng },
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
      const pickupPayload = getLocationPayload(manualPickup, pickupAutocompleteRef);
      const dropPayload = getLocationPayload(manualDrop, dropAutocompleteRef);
      
      const payload = {
        pickup: {
          address: pickupPayload.address,
          coordinates: pickupPayload.coordinates
        },
        drop: {
          address: dropPayload.address,
          coordinates: dropPayload.coordinates
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

    socket.on("driver-arrived", (data) => {
      setRideState("DRIVER_ARRIVED");
      // If email delivery failed, backend sends OTP directly via socket
      if (data && data.otp) {
        setOtpFromSocket(data.otp);
      }
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

  const renderDriverProfile = () => {
    if (!assignedDriver) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', background: '#f8f8f8', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #eaeaea', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
         <div style={{ width: '55px', height: '55px', borderRadius: '50%', backgroundColor: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '15px', overflow: 'hidden', flexShrink: 0 }}>
            <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${assignedDriver.fullName}&backgroundColor=000000&textColor=ffffff`} alt="Driver Avatar" style={{ width: '100%', height: '100%' }} />
         </div>
         <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
               <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#111' }}>{assignedDriver.fullName}</span>
               <span style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #ddd', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                  <span style={{ color: '#f5c518', marginRight: '4px', fontSize: '14px' }}>★</span> {assignedDriver.rating}
               </span>
            </div>
            <div style={{ fontSize: '14px', color: '#555', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
               <span>{assignedDriver.vehicle?.brand} {assignedDriver.vehicle?.model}</span>
               <span style={{ margin: '0 8px', color: '#bbb' }}>|</span>
               <span style={{ background: '#e0e0e0', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', color: '#333' }}>
                 {assignedDriver.vehicle?.rcNumber}
               </span>
            </div>
         </div>
      </div>
    );
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

      {/* 🔴 SELECT DROP ON MAP OVERLAY / CROSSHAIR */}
      {isSelectingDropMap && (
        <>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', zIndex: 10,
            transform: 'translate(-50%, -100%)', pointerEvents: 'none',
            fontSize: '40px', filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.3))'
          }}>
            📍
          </div>
          
          <div style={{
            position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, backgroundColor: 'white', padding: '20px', borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)', width: '90%', maxWidth: '400px', textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Select Drop Location</h3>
            <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px' }}>Drag the map to place the pin at your destination.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setIsSelectingDropMap(false)} 
                style={{ flex: 1, padding: '12px', background: '#ddd', color: 'black', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                Cancel
              </button>
              <button 
                onClick={handleConfirmDropMap} 
                disabled={isLocating} 
                style={{ flex: 2, padding: '12px', background: 'black', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                {isLocating ? "Locating..." : "Confirm Location"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 🟢 DYNAMIC FLOATING PANEL based on State */}
      {!isSelectingDropMap && (
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
            
            <div style={{ position: 'relative' }}>
              <input 
                ref={pickupInputRef} 
                onChange={() => setManualPickup(null)} 
                type="text" 
                placeholder="Current Location" 
                style={{ width: '100%', padding: '14px 45px 14px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', background: '#f8f8f8' }}
              />
              <button 
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                title="Use Current Location"
                style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                {isLocating && !manualPickup ? "⏳" : "📍"}
              </button>
            </div>
            
            <div style={{ position: 'relative' }}>
              <input 
                ref={dropInputRef} 
                onChange={() => setManualDrop(null)}
                type="text" 
                placeholder="Destination" 
                style={{ width: '100%', padding: '14px 45px 14px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', background: '#f8f8f8' }}
              />
              <button 
                onClick={handleOpenMapSelection}
                title="Select on Map"
                style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                🗺
              </button>
            </div>

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
        {rideState === "DRIVER_ASSIGNED" && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '22px' }}>Driver is En Route</h2>
            {renderDriverProfile()}
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Please head to the pickup point.</p>
          </div>
        )}

        {/* PHASE: DRIVER_ARRIVED */}
        {rideState === "DRIVER_ARRIVED" && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📍</div>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '22px' }}>Your driver has arrived!</h2>
            {renderDriverProfile()}

            {otpFromSocket ? (
              // EMAIL FAILED — OTP delivered via socket, show it prominently on screen
              <>
                <p style={{ margin: '0 0 12px 0', color: '#555', fontSize: '14px' }}>
                  ⚠️ Email delivery failed. Here is your OTP — show this to your driver:
                </p>
                <div style={{
                  background: '#1a1a1a', color: '#fff', padding: '20px',
                  borderRadius: '12px', fontSize: '38px', fontWeight: 'bold',
                  letterSpacing: '10px', marginBottom: '12px'
                }}>
                  {otpFromSocket}
                </div>
                <div style={{ background: '#fff3cd', color: '#856404', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold' }}>
                  Show this OTP to your driver to start the trip.
                </div>
              </>
            ) : (
              // EMAIL SENT — normal flow
              <>
                <p style={{ margin: '0 0 15px 0', color: '#555', fontSize: '15px' }}>For your safety, please check your email for the 6-digit OTP and provide it to the driver to start the trip.</p>
                <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}>
                  Do not start the ride until OTP is verified.
                </div>
                <button 
                  onClick={handleResendOtp}
                  disabled={isOtpResending}
                  style={{ width: '100%', marginTop: '15px', padding: '12px', background: '#333', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>
                  {isOtpResending ? "Sending..." : "Resend OTP via Email"}
                </button>
              </>
            )}
          </div>
        )}

        {/* PHASE: RIDE_STARTED */}
        {rideState === "RIDE_STARTED" && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🚗</div>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '22px' }}>You are on your way!</h2>
            {renderDriverProfile()}
            <p style={{ margin: '0', color: '#555', fontSize: '15px' }}>Enjoy your ride to {dropInputRef.current?.value}.</p>
          </div>
        )}

      </div>
      )}
    </div>
  );
}