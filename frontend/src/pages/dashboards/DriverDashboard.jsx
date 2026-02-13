import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from "../../config";

// ✅ Connect to Backend Port 5000
const socket = io(SOCKET_URL);

export default function DriverDashboard() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const myMarkerRef = useRef(null); // Store the driver's own marker

  useEffect(() => {
    const initMap = () => {
      // Default center
      const initialPosition = { lat: 0, lng: 0 };

      if (window.google && mapRef.current && !mapInstanceRef.current) {
        // 1. Initialize Standard Google Map (No mapId needed)
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          zoom: 15,
          center: initialPosition,
          mapTypeId: "roadmap",
          disableDefaultUI: false,
        });
        startTracking();
      }
    };

    // Robust Google Maps Loading Check
    if (window.google && window.google.maps) {
      initMap();
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(interval);
          initMap();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  const startTracking = () => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;

          // 1. Emit location to backend
          // We send 'type: driver' so the User Dashboard knows to show the 'D' icon
          socket.emit("send-location", { latitude, longitude, type: 'driver' });

          // 2. Update Local Map
          if (mapInstanceRef.current) {
            const pos = { lat: latitude, lng: longitude };
            mapInstanceRef.current.setCenter(pos);

            if (myMarkerRef.current) {
              // Update existing marker
              myMarkerRef.current.setPosition(pos);
            } else {
              // ✅ Create NEW Standard Marker (Billing Safe)
              myMarkerRef.current = new window.google.maps.Marker({
                position: pos,
                map: mapInstanceRef.current,
                title: "Me",
                label: {
                  text: "Me",         // Label to show it's the driver
                  color: "white",
                  fontWeight: "bold"
                }
              });
            }
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    } else {
      console.log("Geolocation is not supported by this browser.");
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <h1>Driver Dashboard - You are Online</h1>
      <div id="map" ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '500px' }}></div>
    </div>
  );
}