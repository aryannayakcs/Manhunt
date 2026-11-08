'use client';
import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap, type Marker } from 'maplibre-gl';
import type { LatLng } from '@/lib/protocol';
import { circlePolygon } from '@/lib/util';

export interface Mk { id: string; lat: number; lng: number; color: string; kind?: 'dot' | 'tri' | 'you' | 'label'; label?: string; sub?: string; subBad?: boolean; opacity?: number; hidden?: boolean }
export interface Circle { id: string; lat: number; lng: number; radiusM: number; color: string; opacity?: number }
export interface Line { id: string; color: string; coords: [number, number][] }
export interface MapProps {
  zone?: { center: LatLng | null; radiusM: number } | null;
  finalRadiusM?: number | null;
  jail?: { location: LatLng; radiusM: number } | null;
  markers?: Mk[];
  circles?: Circle[];
  lines?: Line[];
  dim?: boolean;
  /** Fit the zone on first render, then leave the camera alone. */
  fit?: boolean;
  /** Keep camera centred on this point (runner map). */
  follow?: LatLng | null;
  /** Map taps / drag report here (zone editing). */
  onPick?: (p: LatLng) => void;
  draggable?: LatLng | null;
}

// Free dark vector map, no API key or usage limits (openfreemap.org).
// Override with NEXT_PUBLIC_MAP_STYLE (any MapLibre style URL) if you want a different look.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/dark';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function mkEl(m: Mk): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mk';
  el.style.setProperty('--c', m.color);
  el.innerHTML = `<b data-l></b><i class="${m.kind === 'tri' ? 'tri' : m.kind === 'you' ? 'you' : m.kind === 'label' ? 'none' : ''}"></i><em data-s></em>`;
  return el;
}

export default function MapView(p: MapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const mks = useRef(new Map<string, Marker>());
  const fitted = useRef(false);
  const drag = useRef<Marker | null>(null);
  const props = useRef(p);
  props.current = p;

  // create map once
  useEffect(() => {
    if (!box.current) return;
    const c = p.zone?.center ?? p.follow ?? { lat: 20, lng: 0 };
    const m = new maplibregl.Map({
      container: box.current, style: STYLE, center: [c.lng, c.lat], zoom: p.zone?.center || p.follow ? 16 : 2,
      attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
      // Dev only: lets screenshots capture the map canvas.
      preserveDrawingBuffer: process.env.NODE_ENV !== 'production',
    });
    map.current = m;
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __maps?: MLMap[] }).__maps = [...((window as unknown as { __maps?: MLMap[] }).__maps ?? []), m];
    m.on('load', () => {
      m.addSource('zone', { type: 'geojson', data: EMPTY });
      m.addSource('final', { type: 'geojson', data: EMPTY });
      m.addSource('jail', { type: 'geojson', data: EMPTY });
      m.addSource('circles', { type: 'geojson', data: EMPTY });
      m.addSource('lines', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'zone-l', type: 'line', source: 'zone', paint: { 'line-color': ['get', 'c'], 'line-width': 3, 'line-opacity': 0.9 } });
      m.addLayer({ id: 'final-l', type: 'line', source: 'final', paint: { 'line-color': '#ffb020', 'line-width': 2, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'jail-f', type: 'fill', source: 'jail', paint: { 'fill-color': '#ffb020', 'fill-opacity': 0.18 } });
      m.addLayer({ id: 'jail-l', type: 'line', source: 'jail', paint: { 'line-color': '#ffb020', 'line-width': 2 } });
      m.addLayer({ id: 'circ-f', type: 'fill', source: 'circles', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['*', 0.18, ['get', 'o']] } });
      m.addLayer({ id: 'circ-l', type: 'line', source: 'circles', paint: { 'line-color': ['get', 'c'], 'line-width': 2, 'line-opacity': ['get', 'o'], 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'lines-l', type: 'line', source: 'lines', paint: { 'line-color': ['get', 'c'], 'line-width': 3, 'line-opacity': 0.85 } });
      loaded.current = true;
      sync();
    });
    m.on('click', (e) => props.current.onPick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    return () => { m.remove(); map.current = null; loaded.current = false; mks.current.clear(); drag.current = null; fitted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const m = map.current; const pr = props.current;
    if (!m || !loaded.current) return;
    const setData = (id: string, f: GeoJSON.Feature[]) => (m.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: f });
    const zc = pr.zone?.center;
    const zoneCol = pr.dim ? '#8a979c' : '#e9eef0';
    setData('zone', zc ? [{ ...circlePolygon(zc, pr.zone!.radiusM), properties: { c: zoneCol } }] : []);
    setData('final', zc && pr.finalRadiusM ? [circlePolygon(zc, pr.finalRadiusM)] : []);
    setData('jail', pr.jail ? [circlePolygon(pr.jail.location, pr.jail.radiusM, 32)] : []);
    setData('circles', (pr.circles ?? []).map((c) => ({ ...circlePolygon({ lat: c.lat, lng: c.lng }, Math.max(c.radiusM, 1.5), 32), properties: { c: c.color, o: c.opacity ?? 1 } })));
    setData('lines', (pr.lines ?? []).map((l) => ({ type: 'Feature', properties: { c: l.color }, geometry: { type: 'LineString', coordinates: l.coords } })));

    // markers
    const seen = new Set<string>();
    const jailMk: Mk[] = pr.jail ? [{ id: '__jail', lat: pr.jail.location.lat, lng: pr.jail.location.lng, color: '#ffb020', kind: 'label', label: '⛓ JAIL' }] : [];
    for (const k of [...jailMk, ...(pr.markers ?? [])]) {
      if (k.hidden) continue;
      seen.add(k.id);
      let mk = mks.current.get(k.id);
      if (!mk) { mk = new maplibregl.Marker({ element: mkEl(k) }).setLngLat([k.lng, k.lat]).addTo(m); mks.current.set(k.id, mk); }
      mk.setLngLat([k.lng, k.lat]);
      const el = mk.getElement();
      el.style.opacity = String(k.opacity ?? 1);
      el.style.setProperty('--c', k.color);
      (el.querySelector('[data-l]') as HTMLElement).textContent = k.label ?? '';
      const s = el.querySelector('[data-s]') as HTMLElement; s.textContent = k.sub ?? ''; s.className = k.subBad ? 'bad' : '';
    }
    for (const [id, mk] of mks.current) if (!seen.has(id)) { mk.remove(); mks.current.delete(id); }

    // draggable zone/jail handle
    if (pr.draggable) {
      if (!drag.current) {
        const el = document.createElement('div'); el.className = 'mk'; el.style.setProperty('--c', '#fff');
        el.innerHTML = '<i style="width:30px;height:30px;border:4px solid #000;background:#fff;box-shadow:0 0 0 4px #1fe3b4"></i>';
        el.style.pointerEvents = 'auto';
        drag.current = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([pr.draggable.lng, pr.draggable.lat]).addTo(m);
        drag.current.on('dragend', () => { const l = drag.current!.getLngLat(); props.current.onPick?.({ lat: l.lat, lng: l.lng }); });
      } else drag.current.setLngLat([pr.draggable.lng, pr.draggable.lat]);
    } else if (drag.current) { drag.current.remove(); drag.current = null; }

    // camera
    if (pr.fit && zc && !fitted.current) {
      fitted.current = true;
      const d = pr.zone!.radiusM * 1.25, dLat = d / 111320, dLng = d / (111320 * Math.cos((zc.lat * Math.PI) / 180));
      m.fitBounds([[zc.lng - dLng, zc.lat - dLat], [zc.lng + dLng, zc.lat + dLat]], { duration: 0, padding: 8 });
    }
    if (pr.follow) {
      if (!fitted.current && !pr.fit) { fitted.current = true; m.jumpTo({ center: [pr.follow.lng, pr.follow.lat], zoom: 17 }); }
      else if (!pr.fit) m.easeTo({ center: [pr.follow.lng, pr.follow.lat], duration: 800 });
    }
  }
  useEffect(sync);

  return <div className="mapbox"><div ref={box} /></div>;
}
