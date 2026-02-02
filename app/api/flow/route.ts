import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Get bounding box from query params
  const west = parseFloat(searchParams.get('west') || '-180');
  const south = parseFloat(searchParams.get('south') || '-90');
  const east = parseFloat(searchParams.get('east') || '180');
  const north = parseFloat(searchParams.get('north') || '90');
  const limit = parseInt(searchParams.get('limit') || '5000');

  try {
    // Query streams with flow data within bounding box
    const result = await pool.query(`
      SELECT 
        r.comid,
        n.streamflow_cms,
        n.velocity_ms,
        r.gnis_name,
        r.stream_order,
        ST_AsGeoJSON(ST_Simplify(r.geom, 0.001))::json as geometry
      FROM river_edges r
      JOIN nwm_velocity n ON r.comid = n.comid
      WHERE ST_Intersects(
        r.geom, 
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      AND n.streamflow_cms > 0
      ORDER BY n.streamflow_cms DESC
      LIMIT $5
    `, [west, south, east, north, limit]);

    // Build GeoJSON FeatureCollection
    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map((row: any) => ({
        type: 'Feature',
        properties: {
          comid: row.comid,
          streamflow_cms: row.streamflow_cms,
          velocity_ms: row.velocity_ms,
          name: row.gnis_name,
          stream_order: row.stream_order,
          // Pre-calculate flow category for styling
          flow_category: getFlowCategory(row.streamflow_cms)
        },
        geometry: row.geometry
      }))
    };

    return NextResponse.json(geojson);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch flow data' }, { status: 500 });
  }
}

function getFlowCategory(cms: number): string {
  if (cms < 1) return 'very_low';
  if (cms < 10) return 'low';
  if (cms < 50) return 'moderate';
  if (cms < 200) return 'high';
  if (cms < 1000) return 'very_high';
  return 'extreme';
}
