import React, { useState, useCallback, useRef, useEffect } from "react";
import Map, { Source, Layer, NavigationControl, ScaleControl } from "react-map-gl";
import type { MapRef } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// S3 URL for live NWM data
const S3_LIVE_DATA_URL = "https://nwm-streamflow-data.s3.us-east-1.amazonaws.com/live/current_velocity.json";

// Tileset with COMID (Vermont rivers)
const RIVER_TILESET = "mapbox://lman967.9hfg3bbo";
const SOURCE_LAYER = "vtRivers-3bijjc";

// Refresh interval: 15 minutes
const REFRESH_INTERVAL = 15 * 60 * 1000;

interface LiveData {
  generated_at: string;
  reference_time: string;
  site_count: number;
  sites: Record<string, number>; // comid → streamflow (m³/s)
}

// Categorize streamflow for styling
function getFlowCategory(cms: number): string {
  if (cms < 1) return "very_low";
  if (cms < 10) return "low";
  if (cms < 50) return "moderate";
  if (cms < 200) return "high";
  if (cms < 1000) return "very_high";
  return "extreme";
}

const StreamflowMap: React.FC = () => {
  const mapRef = useRef<MapRef>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [referenceTime, setReferenceTime] = useState<string | null>(null);
  const [stats, setStats] = useState({ count: 0, maxFlow: 0 });
  const [error, setError] = useState<string | null>(null);

  const [viewport] = useState({
    latitude: 44.0,
    longitude: -72.7,
    zoom: 9,
  });

  // Apply feature states to the map (chunked to avoid blocking UI)
  const applyFeatureStates = useCallback((data: LiveData) => {
    if (!mapRef.current) return;

    const map = mapRef.current.getMap();
    if (!map.getSource("rivers")) {
      console.warn("Source not ready");
      return;
    }

    const entries = Object.entries(data.sites);
    let index = 0;
    let successCount = 0;
    let maxFlow = 0;
    const CHUNK_SIZE = 5000;

    const processChunk = () => {
      const end = Math.min(index + CHUNK_SIZE, entries.length);
      
      for (let i = index; i < end; i++) {
        const [comid, streamflow] = entries[i];
        try {
          map.setFeatureState(
            {
              source: "rivers",
              sourceLayer: SOURCE_LAYER,
              id: Number(comid),
            },
            {
              flow: streamflow,
              category: getFlowCategory(streamflow),
            }
          );
          successCount++;
          if (streamflow > maxFlow) maxFlow = streamflow;
        } catch (e) {
          // Feature may not be in tileset
        }
      }

      index = end;
      
      if (index < entries.length) {
        requestAnimationFrame(processChunk);
      } else {
        console.log(`Applied feature states to ${successCount.toLocaleString()} streams`);
        setStats({ count: successCount, maxFlow });
      }
    };

    processChunk();
  }, []);

  // Fetch live data from S3
  const fetchLiveData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${S3_LIVE_DATA_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: LiveData = await response.json();
      setLastUpdate(new Date());
      setReferenceTime(data.reference_time);

      applyFeatureStates(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch";
      setError(msg);
      console.error("Error fetching live data:", err);
    } finally {
      setLoading(false);
    }
  }, [applyFeatureStates]);

  // Set up auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchLiveData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  // Fetch when map source is ready
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const checkAndFetch = () => {
      if (map.getSource("rivers") && map.isSourceLoaded("rivers")) {
        fetchLiveData();
      }
    };

    map.on("sourcedata", (e) => {
      if (e.sourceId === "rivers" && e.isSourceLoaded) {
        fetchLiveData();
      }
    });

    // Check immediately in case already loaded
    checkAndFetch();
  }, [fetchLiveData]);

  // Layer style using feature-state
  const riverLayerStyle: any = {
    id: "river-flow-layer",
    type: "line",
    source: "rivers",
    "source-layer": SOURCE_LAYER,
    paint: {
      // Color based on flow category via feature-state
      "line-color": [
        "case",
        ["==", ["feature-state", "category"], "extreme"], "#dc2626",
        ["==", ["feature-state", "category"], "very_high"], "#ef4444",
        ["==", ["feature-state", "category"], "high"], "#f97316",
        ["==", ["feature-state", "category"], "moderate"], "#eab308",
        ["==", ["feature-state", "category"], "low"], "#84cc16",
        ["==", ["feature-state", "category"], "very_low"], "#22c55e",
        "#64748b", // Default gray (no data)
      ],
      // Width based on flow value
      "line-width": [
        "interpolate",
        ["linear"],
        ["coalesce", ["feature-state", "flow"], 0],
        0, 1,
        10, 2,
        100, 3,
        1000, 5,
        10000, 8,
      ],
      "line-opacity": 0.85,
    },
  };

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <Map
        ref={mapRef}
        initialViewState={viewport}
        onLoad={handleMapLoad}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-right" unit="imperial" />

        {/* River tileset source */}
        <Source
          id="rivers"
          type="vector"
          url={RIVER_TILESET}
          promoteId={{ [SOURCE_LAYER]: "comid" }}
        >
          <Layer {...riverLayerStyle} />
        </Source>
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
            background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
            NWM Streamflow
          </div>
          <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", marginTop: 2 }}>
            {loading ? "Loading..." : error ? `Error: ${error}` : `${stats.count.toLocaleString()} streams`}
            {referenceTime && !loading && (
              <span> • {new Date(referenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} UTC</span>
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
          { label: "> 1000 (Extreme)", color: "#dc2626" },
          { label: "200-1000 (Very High)", color: "#ef4444" },
          { label: "50-200 (High)", color: "#f97316" },
          { label: "10-50 (Moderate)", color: "#eab308" },
          { label: "1-10 (Low)", color: "#84cc16" },
          { label: "< 1 (Very Low)", color: "#22c55e" },
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
          Data: NOAA National Water Model
        </div>
      </div>
    </div>
  );
};

export default StreamflowMap;
