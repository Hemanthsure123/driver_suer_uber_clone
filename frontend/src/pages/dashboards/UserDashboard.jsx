import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from "../../config";

// ✅ Connect to Backend Port 5000
const socket = io(SOCKET_URL);

export default function UserDashboard() {
  // Map & Logic Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const googleClassesRef = useRef(null);

  // Search & Routing Refs
  const pickupInputRef = useRef(null);
  const dropInputRef = useRef(null);
  const pickupAutocompleteRef = useRef(null);
  const dropAutocompleteRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  // State
  const [routeDetails, setRouteDetails] = useState(null);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    const initMap = async () => {
      // 1. Wait for Google API to load
      if (!window.google) return;

      try {
        // 2. Import Libraries
        const { Map } = await window.google.maps.importLibrary("maps");
        const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
        const { Autocomplete } = await window.google.maps.importLibrary("places");
        const { DirectionsService, DirectionsRenderer } = await window.google.maps.importLibrary("routes");

        googleClassesRef.current = { Map, AdvancedMarkerElement, PinElement, DirectionsService, DirectionsRenderer };

        const initialPosition = { lat: 20.5937, lng: 78.9629 }; // India Center

        // 3. Create Map (Force height in CSS below)
        if (mapRef.current && !mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            zoom: 5,
            center: initialPosition,
            mapId: "DEMO_MAP_ID", 
            mapTypeId: "roadmap",
            disableDefaultUI: false,
          });

          // 4. Initialize Services
          directionsServiceRef.current = new DirectionsService();
          directionsRendererRef.current = new DirectionsRenderer({
            map: mapInstanceRef.current,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#4285F4",
              strokeWeight: 6,
              strokeOpacity: 0.8,
            }
          });

          // 5. Initialize Search
          initAutocomplete(Autocomplete);

          setIsMapReady(true);
          setupSocketListeners();
          socket.emit("request-locations");
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
    };
  }, []);

  const initAutocomplete = (AutocompleteClass) => {
    if (!pickupInputRef.current || !dropInputRef.current) return;
    const options = { fields: ["geometry", "name"], types: ["geocode", "establishment"] };
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
        setRouteDetails({ distance: leg.distance.text, duration: leg.duration.text });
      } else {
        alert("Route calculation failed: " + status);
      }
    });
  };

  const setupSocketListeners = () => {
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
             const pin = new PinElement({ glyph: "D", background: "#0F52BA", borderColor: "#00008B", glyphColor: "white" });
             markersRef.current[id] = new AdvancedMarkerElement({
               position, map: mapInstanceRef.current, title: "Driver " + id, content: pin.element
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
               const pin = new PinElement({ glyph: "U", background: "green", borderColor: "darkgreen", glyphColor: "white" });
               markersRef.current['me'] = new AdvancedMarkerElement({ position: pos, map: mapInstanceRef.current, title: "You", content: pin.element });
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

  return (
    // 🔴 FIX: Use position: fixed to ensure full screen coverage
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      
      {/* 🔍 SEARCH BOX: High Z-Index to float on top */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000, // Very high z-index
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        width: '90%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <h3 style={{ margin: 0, textAlign: 'center', color: '#333' }}>Find a Ride</h3>
        
        <input 
          ref={pickupInputRef} 
          type="text" 
          placeholder="Enter Pickup Location" 
          style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', color: 'black', background: 'white' }}
        />
        
        <input 
          ref={dropInputRef} 
          type="text" 
          placeholder="Enter Drop Location" 
          style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', color: 'black', background: 'white' }}
        />

        <button 
          onClick={handleGetRoute}
          style={{
            padding: '12px',
            backgroundColor: 'black',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Find Ride
        </button>
      </div>

      {/* 🔵 ROUTE DETAILS */}
      {routeDetails && (
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          backgroundColor: 'white',
          padding: '15px 30px',
          borderRadius: '50px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          fontWeight: 'bold',
          color: 'black'
        }}>
          <span>🚗 {routeDetails.distance}</span>
          <span style={{ color: '#ccc' }}>|</span>
          <span>⏱️ {routeDetails.duration}</span>
        </div>
      )}

      {/* 🗺️ MAP CONTAINER: Must have 100% height */}
      <div id="map" ref={mapRef} style={{ width: '100%', height: '100%', background: '#f0f0f0' }}></div>
    </div>
  );
}