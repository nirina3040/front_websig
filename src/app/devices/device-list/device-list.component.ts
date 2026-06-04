import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService, Device } from '../../services/device.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-device-list',
  templateUrl: './device-list.component.html',
  styleUrls: ['./device-list.component.css']
})
export class DeviceListComponent implements OnInit, OnDestroy {
  devices: Device[] = [];
  filteredDevices: Device[] = [];
  isLoading = true;
  searchTerm = '';
  statusFilter = 'all';
  selectedDevice: Device | null = null;
  
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 0;
  
  statistics = {
    total: 0,
    online: 0,
    offline: 0,
    active: 0
  };
  
  viewMode: 'grid' | 'list' = 'grid';
  showDeleteModal = false;
  deviceToDelete: Device | null = null;
  
  private subscriptions: any[] = [];

  constructor(
    private deviceService: DeviceService,
    private socketService: SocketService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDevices();
    this.initSocketListeners();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub?.unsubscribe());
  }

  loadDevices(): void {
    this.isLoading = true;
    this.deviceService.getDevices().subscribe({
      next: (response: any) => {
        this.devices = response.devices || response;
        this.updateStatistics();
        this.applyFilters();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading devices:', error);
        this.isLoading = false;
      }
    });
  }

  initSocketListeners(): void {
    this.subscriptions.push(
      this.socketService.onDeviceStatusChange().subscribe((data: any) => {
        const device = this.devices.find(d => d.device_uuid === data.deviceUuid);
        if (device) {
          device.status = data.status;
          this.updateStatistics();
          this.applyFilters();
        }
      })
    );
    
    this.subscriptions.push(
      this.socketService.onLocationUpdate().subscribe((data: any) => {
        const device = this.devices.find(d => d.device_uuid === data.deviceUuid);
        if (device) {
          device.last_position = {
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: data.timestamp
          };
          this.applyFilters();
        }
      })
    );
  }

  updateStatistics(): void {
    const online = this.devices.filter(d => d.status === 'online').length;
    const offline = this.devices.filter(d => d.status === 'offline').length;
    const active = this.devices.filter(d => d.last_position && 
      new Date(d.last_position.timestamp).getTime() > Date.now() - 5 * 60 * 1000).length;
    
    this.statistics = {
      total: this.devices.length,
      online,
      offline,
      active
    };
  }

  applyFilters(): void {
    let filtered = [...this.devices];
    
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(device => 
        device.device_name.toLowerCase().includes(term) ||
        device.device_uuid.toLowerCase().includes(term)
      );
    }
    
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(device => device.status === this.statusFilter);
    }
    
    this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.filteredDevices = filtered.slice(start, end);
  }

  onSearchChange(searchTerm: string): void {
    this.searchTerm = searchTerm;
    this.currentPage = 1;
    this.applyFilters();
  }

  onStatusFilterChange(status: string): void {
    this.statusFilter = status;
    this.currentPage = 1;
    this.applyFilters();
  }

  changePage(page: number): void {
    this.currentPage = page;
    this.applyFilters();
  }

  viewDeviceDetails(device: Device): void {
    this.selectedDevice = device;
  }

  closeDetails(): void {
    this.selectedDevice = null;
  }

  confirmDelete(device: Device): void {
    this.deviceToDelete = device;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deviceToDelete = null;
  }

  deleteDevice(): void {
    if (this.deviceToDelete) {
      this.deviceService.deleteDevice(this.deviceToDelete.id).subscribe({
        next: () => {
          this.devices = this.devices.filter(d => d.id !== this.deviceToDelete?.id);
          this.updateStatistics();
          this.applyFilters();
          this.closeDeleteModal();
        },
        error: (error) => {
          console.error('Error deleting device:', error);
        }
      });
    }
  }

  trackDevice(device: Device): void {
    this.router.navigate(['/dashboard'], { 
      queryParams: { deviceId: device.id, tab: 'map' }
    });
  }

  refreshDeviceStatus(device: Device): void {
    this.deviceService.getDeviceHistory(device.id, 1).subscribe({
      next: () => {},
      error: (error) => {
        console.error('Error refreshing device:', error);
      }
    });
  }

  // CORRECTION ICI - Ajout de gestion pour undefined
  formatDate(date: string | Date | undefined): string {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  getStatusIcon(status: string): string {
    switch(status) {
      case 'online': return 'bi-wifi';
      case 'offline': return 'bi-wifi-off';
      default: return 'bi-question-circle';
    }
  }

  getStatusClass(status: string): string {
    switch(status) {
      case 'online': return 'status-online';
      case 'offline': return 'status-offline';
      default: return 'status-unknown';
    }
  }

  getBatteryIcon(batteryLevel?: number): string {
    if (!batteryLevel) return 'bi-battery';
    if (batteryLevel >= 75) return 'bi-battery-full';
    if (batteryLevel >= 50) return 'bi-battery-half';
    if (batteryLevel >= 25) return 'bi-battery-quarter';
    return 'bi-battery-empty';
  }

  exportDevices(): void {
    const data = this.devices.map(device => ({
      name: device.device_name,
      uuid: device.device_uuid,
      status: device.status,
      last_latitude: device.last_position?.latitude,
      last_longitude: device.last_position?.longitude,
      last_update: device.last_position?.timestamp,
      registered: device.created_at
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devices_export_${new Date().toISOString()}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}