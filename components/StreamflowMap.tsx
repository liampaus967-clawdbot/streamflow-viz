import React, { useState, useCallback, useRef, useEffect } from "react";
import Map, { Source, Layer, NavigationControl, ScaleControl } from "react-map-gl";
import type { MapRef, ViewStateChangeEvent } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Debounce helper
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Flow color scale: green (low) → yellow → orange → red (high)
const FLOW_COLORS = {
  very_low: "#22c55e",   // Green
  low: "#84cc16",        // Lime
  moderate: "#eab308",   // Yellow
  high: "#f97316",       // Orange
  very_high: "#ef4444",  // Red
  extreme: "#dc2626",    // Dark Red
};

interface FlowFeature {
  type: "Feature";
  properties: {
    comid: number;
    streamflow_cms: number;
    velocity_ms: number;
    name: string | null;
    stream_order: number;
    flow_category: string;
  };
  geometry: any;
}

interface FlowData {
  type: "FeatureCollection";
  features: FlowFeature[];
}

const StreamflowMap: React.FC = () => {
  const mapRef = useRef<MapRef>(null);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [stats, setStats] = useState({ count: 0, maxFlow: 0 });

  const [viewport, setViewport] = useState({
    latitude: 46.8721,
    longitude: -114.0091,
    zoom: 8,
  });

  // Fetch flow data for current bounds
  const fetchFlowDataInner = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;
    
    const zoom = map.getZoom();
    
    // Adjust limit based on zoom - fewer features when zoomed out
    let limit = 2000;
    if (zoom >= 8) limit = 5000;
    if (zoom >= 10) limit = 8000;
    if (zoom < 6) limit = 1000;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        west: bounds.getWest().toString(),
        south: bounds.getSouth().toString(),
        east: bounds.getEast().toString(),
        north: bounds.getNorth().toString(),
        limit: limit.toString(),
      });

      const response = await fetch(`/api/flow?${params}`);
      const data: FlowData = await response.json();
      
      setFlowData(data);
      setLastUpdate(new Date());
      
      // Calculate stats
      if (data.features.length > 0) {
        const maxFlow = Math.max(...data.features.map(f => f.properties.streamflow_cms));
        setStats({ count: data.features.length, maxFlow });
      }
    } catch (error) {
      console.error("Failed to fetch flow data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced version - waits 300ms after pan/zoom stops
  const fetchFlowData = useCallback(
    debounce(fetchFlowDataInner, 300),
    [fetchFlowDataInner]
  );

  // Fetch data on map move end
  const handleMoveEnd = useCallback((evt: ViewStateChangeEvent) => {
    setViewport(evt.viewState);
    fetchFlowData();
  }, [fetchFlowData]);

  // Initial fetch
  useEffect(() => {
    const timer = setTimeout(fetchFlowData, 500);
    return () => clearTimeout(timer);
  }, [fetchFlowData]);

  // Layer style for flow lines
  const flowLayerStyle: any = {
    id: "streamflow-layer",
    type: "line",
    paint: {
      "line-color": [
        "match",
        ["get", "flow_category"],
        "very_low", FLOW_COLORS.very_low,
        "low", FLOW_COLORS.low,
        "moderate", FLOW_COLORS.moderate,
        "high", FLOW_COLORS.high,
        "very_high", FLOW_COLORS.very_high,
        "extreme", FLOW_COLORS.extreme,
        "#3b82f6" // default blue
      ],
      "line-width": [
        "interpolate",
        ["linear"],
        ["get", "streamflow_cms"],
        0, 1,
        10, 2,
        100, 3,
        1000, 5,
        10000, 8
      ],
      "line-opacity": 0.85,
    },
  };

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <Map
        ref={mapRef}
        {...viewport}
        onMoveEnd={handleMoveEnd}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-right" unit="imperial" />

        {flowData && (
          <Source id="streamflow" type="geojson" data={flowData}>
            <Layer {...flowLayerStyle} />
          </Source>
        )}
      </Map>

      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          padding: "14px 20px",
          borderRadius: 16,
          background: "rgba(15, 23, 42, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(34, 197, 94, 0.4)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
            Streamflow
          </div>
          <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", marginTop: 2 }}>
            {loading ? "Loading..." : `${stats.count.toLocaleString()} streams`}
            {lastUpdate && !loading && (
              <span> • {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 16,
          padding: 16,
          borderRadius: 16,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          zIndex: 10,
          minWidth: 180,
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.12)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 12 }}>
          Flow Rate (m³/s)
        </div>
        {[
          { label: "> 1000 (Extreme)", color: FLOW_COLORS.extreme },
          { label: "200-1000 (Very High)", color: FLOW_COLORS.very_high },
          { label: "50-200 (High)", color: FLOW_COLORS.high },
          { label: "10-50 (Moderate)", color: FLOW_COLORS.moderate },
          { label: "1-10 (Low)", color: FLOW_COLORS.low },
          { label: "< 1 (Very Low)", color: FLOW_COLORS.very_low },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "4px 0",
            }}
          >
            <div
              style={{
                width: 20,
                height: 4,
                borderRadius: 2,
                background: item.color,
              }}
            />
            <span style={{ fontSize: 11, color: "#475569" }}>{item.label}</span>
          </div>
        ))}
        <div style={{ 
          fontSize: 10, 
          color: "#94a3b8", 
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid rgba(0,0,0,0.06)"
        }}>
          Data: National Water Model
        </div>
      </div>
    </div>
  );
};

export default StreamflowMap;
