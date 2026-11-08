'use client';
import dynamic from 'next/dynamic';
const Map = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="mapbox" /> });
export default Map;
export type { Mk, Circle, Line, MapProps } from './MapView';
