import { Component, Input, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  @Input() devices: any[] = [];
  @Input() selectedDevice: any = null;
  @Input() center: [number, number] = [48.8566, 2.3522];
  @Input() zoom: number = 13;
  @Input() mapType: string = 'street';
  
  private map: L.Map | undefined;
  private markers: Map<string, L.Marker> = new Map();
  private circles: Map<string, L.Circle> = new Map();
  private polylines: Map<string, L.Polyline> = new Map();
  private positionHistory: Map<string, L.LatLng[]> = new Map();
  private currentTileLayer: L.TileLayer | undefined;
  private currentCenterMarker: L.Marker | undefined;
  private isMapReady = false; // Flag pour vérifier si la carte est prête
  
  private onlineIcon = L.divIcon({
    html: '<div class="custom-marker online"><i class="bi bi-phone-fill"></i><div class="pulse"></div></div>',
    className: 'custom-div-icon',
    iconSize: [40, 40],
    popupAnchor: [0, -20]
  });
  
  private offlineIcon = L.divIcon({
    html: '<div class="custom-marker offline"><i class="bi bi-phone-slash"></i></div>',
    className: 'custom-div-icon',
    iconSize: [40, 40],
    popupAnchor: [0, -20]
  });
  
  private trackingIcon = L.divIcon({
    html: '<div class="custom-marker tracking"><i class="bi bi-geo-alt-fill"></i><div class="tracking-pulse"></div></div>',
    className: 'custom-div-icon',
    iconSize: [40, 40],
    popupAnchor: [0, -20]
  });

  constructor(private socketService: SocketService) {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }

  ngOnInit(): void {
    this.initEventListeners();
    this.listenToSocketEvents();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initMap();
      this.isMapReady = true;
      // Mettre à jour les marqueurs après que la carte soit prête
      this.updateAllMarkers();
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapType'] && !changes['mapType'].firstChange && this.isMapReady && this.map) {
      this.changeMapType(this.mapType);
    }
    if (changes['devices'] && this.isMapReady && this.map) {
      this.updateAllMarkers();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private listenToSocketEvents(): void {
    this.socketService.onLocationUpdate().subscribe((data: any) => {
      console.log('🗺️ Map component received location:', data);
      if (this.isMapReady && this.map) {
        this.updateLocationFromSocket(data);
      }
    });
  }

  private updateLocationFromSocket(data: any): void {
    const { deviceUuid, latitude, longitude, deviceName, speed, timestamp } = data;
    
    if (!latitude || !longitude) {
      console.warn('⚠️ Invalid location data:', data);
      return;
    }
    
    console.log(`📍 Updating position for device ${deviceUuid}: ${latitude}, ${longitude}`);
    
    const device = this.devices.find(d => d.device_uuid === deviceUuid);
    
    if (device) {
      device.last_position = {
        latitude: latitude,
        longitude: longitude,
        timestamp: timestamp || new Date().toISOString(),
        speed: speed
      };
      this.addOrUpdateMarkerFromSocket(deviceUuid, latitude, longitude, device.device_name, device.status);
    } else {
      this.addOrUpdateMarkerFromSocket(deviceUuid, latitude, longitude, deviceName || deviceUuid, 'online');
    }
  }

  private addOrUpdateMarkerFromSocket(deviceUuid: string, lat: number, lng: number, deviceName: string, status: string): void {
    if (!this.isMapReady || !this.map) {
      console.warn('⚠️ Map not ready yet, marker will be added later');
      return;
    }
    
    const latlng = L.latLng(lat, lng);
    const isSelected = this.selectedDevice?.device_uuid === deviceUuid;
    
    if (this.markers.has(deviceUuid)) {
      this.map.removeLayer(this.markers.get(deviceUuid)!);
    }
    
    const popupContent = `
      <div class="device-popup-content">
        <div class="popup-header">
          <i class="bi bi-phone-fill"></i>
          <strong>${deviceName}</strong>
          <span class="status-badge ${status}">${status}</span>
        </div>
        <div class="popup-body">
          <div class="info-row">
            <i class="bi bi-geo-alt"></i>
            <span>Lat: ${lat.toFixed(6)}</span>
          </div>
          <div class="info-row">
            <i class="bi bi-geo-alt"></i>
            <span>Lng: ${lng.toFixed(6)}</span>
          </div>
          <div class="info-row">
            <i class="bi bi-clock"></i>
            <span>Updated: ${new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    `;
    
    const icon = isSelected ? this.trackingIcon : (status === 'online' ? this.onlineIcon : this.offlineIcon);
    const marker = L.marker(latlng, { icon }).bindPopup(popupContent, {
      maxWidth: 300,
      minWidth: 200,
      className: 'device-popup'
    });
    
    marker.addTo(this.map);
    this.markers.set(deviceUuid, marker);
    console.log(`✅ Marker updated for device: ${deviceName}`);
    
    if (isSelected) {
      this.map.flyTo(latlng, 15);
    }
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: this.center,
      zoom: this.zoom,
      zoomControl: true,
      fadeAnimation: true,
      zoomAnimation: true,
      markerZoomAnimation: true
    });
    
    this.changeMapType(this.mapType);
    
    L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => { this.onMapClick(e); });
    this.addLocateControl();
    
    console.log('🗺️ Map initialized');
  }

  private changeMapType(type: string): void {
    if (!this.map) return;
    
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }
    
    let tileUrl = '';
    let attribution = '';
    
    switch(type) {
      case 'satellite':
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        attribution = 'Tiles &copy; Esri';
        break;
      case 'terrain':
        tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
        attribution = 'Map data: &copy; OpenStreetMap contributors';
        break;
      case 'dark':
        tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
        break;
      default:
        tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
        break;
    }
    
    this.currentTileLayer = L.tileLayer(tileUrl, {
      attribution: attribution,
      maxZoom: 19,
      minZoom: 3
    }).addTo(this.map);
    
    console.log(`🗺️ Map type changed to: ${type}`);
  }

  private addLocateControl(): void {
    if (!this.map) return;
    
    const locateControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.innerHTML = '<button style="width: 30px; height: 30px; background: white; border: none; cursor: pointer; border-radius: 4px;"><i class="bi bi-crosshair"></i></button>';
        container.style.backgroundColor = 'white';
        container.style.cursor = 'pointer';
        container.onclick = () => { this.locateUser(); };
        return container;
      }
    });
    this.map.addControl(new locateControl());
  }

  private locateUser(): void {
    if (!this.map) return;
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
          this.map!.flyTo(latlng, 15);
          if (this.currentCenterMarker) { this.map!.removeLayer(this.currentCenterMarker); }
          this.currentCenterMarker = L.marker(latlng, {
            icon: L.divIcon({
              html: '<div class="current-location-marker"><i class="bi bi-dot"></i></div>',
              className: 'current-location',
              iconSize: [20, 20]
            })
          }).addTo(this.map!).bindPopup('Vous êtes ici').openPopup();
        },
        (error) => { console.error('Geolocation error:', error); }
      );
    }
  }

  private initEventListeners(): void {
    window.addEventListener('deviceLocationUpdate', ((event: CustomEvent) => {
      if (this.isMapReady && this.map) {
        this.updateDeviceMarker(event.detail.device, event.detail.position);
      }
    }) as EventListener);
    
    window.addEventListener('centerMapOnDevice', ((event: CustomEvent) => {
      if (this.isMapReady && this.map) {
        this.centerOnDevice(event.detail.lat, event.detail.lng, event.detail.device);
      }
    }) as EventListener);
  }

  updateDevices(devices: any[]): void {
    this.devices = devices;
    if (this.isMapReady && this.map) {
      this.updateAllMarkers();
    }
  }

  private updateAllMarkers(): void {
    if (!this.isMapReady || !this.map) return;
    
    this.devices.forEach(device => {
      if (device.last_position) {
        this.addOrUpdateMarker(device);
      }
    });
  }

  private addOrUpdateMarker(device: any): void {
    if (!this.isMapReady || !this.map) return;
    
    const position = device.last_position;
    if (!position) return;
    
    const latlng = L.latLng(position.latitude, position.longitude);
    const isOnline = device.status === 'online';
    const isSelected = this.selectedDevice?.id === device.id;
    
    if (this.markers.has(device.device_uuid)) {
      this.map.removeLayer(this.markers.get(device.device_uuid)!);
    }
    
    const popupContent = this.createPopupContent(device);
    const icon = isSelected ? this.trackingIcon : (isOnline ? this.onlineIcon : this.offlineIcon);
    const marker = L.marker(latlng, { icon }).bindPopup(popupContent, {
      maxWidth: 300,
      minWidth: 200,
      className: 'device-popup'
    });
    
    marker.on('click', () => { this.onMarkerClick(device); });
    marker.addTo(this.map);
    this.markers.set(device.device_uuid, marker);
    
    if (position.accuracy) {
      if (this.circles.has(device.device_uuid)) { this.map.removeLayer(this.circles.get(device.device_uuid)!); }
      const circle = L.circle(latlng, {
        radius: position.accuracy,
        color: isOnline ? '#10b981' : '#ef4444',
        weight: 1,
        opacity: 0.5,
        fillColor: isOnline ? '#10b981' : '#ef4444',
        fillOpacity: 0.1
      }).addTo(this.map);
      this.circles.set(device.device_uuid, circle);
    }
    
    if (!this.positionHistory.has(device.device_uuid)) {
      this.positionHistory.set(device.device_uuid, []);
    }
    const history = this.positionHistory.get(device.device_uuid)!;
    history.push(latlng);
    if (history.length > 100) { history.shift(); }
    this.updatePolyline(device.device_uuid, history);
  }

  private updateDeviceMarker(device: any, position: any): void {
    if (position && position.latitude && position.longitude && this.isMapReady && this.map) {
      device.last_position = position;
      this.addOrUpdateMarker(device);
    }
  }

  private updatePolyline(deviceUuid: string, positions: L.LatLng[]): void {
    if (!this.map) return;
    
    if (this.polylines.has(deviceUuid)) { this.map.removeLayer(this.polylines.get(deviceUuid)!); }
    if (positions.length > 1) {
      const polyline = L.polyline(positions, {
        color: '#667eea',
        weight: 3,
        opacity: 0.6
      }).addTo(this.map);
      this.polylines.set(deviceUuid, polyline);
    }
  }

  private createPopupContent(device: any): string {
    const position = device.last_position;
    const lastUpdate = position ? new Date(position.timestamp).toLocaleString() : 'Never';
    const speed = position?.speed ? `${(position.speed * 3.6).toFixed(1)} km/h` : 'N/A';
    
    return `
      <div class="device-popup-content">
        <div class="popup-header">
          <i class="bi bi-phone-fill"></i>
          <strong>${device.device_name}</strong>
          <span class="status-badge ${device.status}">${device.status}</span>
        </div>
        <div class="popup-body">
          <div class="info-row">
            <i class="bi bi-geo-alt"></i>
            <span>Lat: ${position?.latitude?.toFixed(6)}</span>
          </div>
          <div class="info-row">
            <i class="bi bi-geo-alt"></i>
            <span>Lng: ${position?.longitude?.toFixed(6)}</span>
          </div>
          <div class="info-row">
            <i class="bi bi-clock"></i>
            <span>Updated: ${lastUpdate}</span>
          </div>
        </div>
      </div>
    `;
  }

  private onMarkerClick(device: any): void {
    const event = new CustomEvent('deviceSelected', { detail: device });
    window.dispatchEvent(event);
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    console.log('Map clicked at:', e.latlng);
  }

  public centerOnDevice(lat: number, lng: number, device?: any): void {
    if (!this.map) return;
    
    this.map.flyTo([lat, lng], 15, { duration: 1.5 });
    if (device && this.markers.has(device.device_uuid)) {
      this.markers.get(device.device_uuid)?.openPopup();
    }
  }

  public fitBoundsToDevices(): void {
    if (!this.map) return;
    
    const bounds = L.latLngBounds([]);
    let hasBounds = false;
    this.markers.forEach(marker => {
      bounds.extend(marker.getLatLng());
      hasBounds = true;
    });
    if (hasBounds) {
      this.map.flyToBounds(bounds, { padding: [50, 50] });
    }
  }

  public clearHistory(): void {
    if (!this.map) return;
    
    this.polylines.forEach(polyline => { this.map!.removeLayer(polyline); });
    this.polylines.clear();
    this.positionHistory.clear();
  }
}