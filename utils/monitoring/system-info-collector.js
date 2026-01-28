/**
 * System Information Collector
 * Collects hardware inventory, USB devices, and system specifications
 */

const si = require('systeminformation');
const os = require('os');
const logger = require('./logger');

class SystemInfoCollector {
  constructor() {
    this.lastCollection = null;
    this.cachedInfo = null;
    this.cacheExpiry = 3600000; // 1 hour
  }

  /**
   * Collect complete system information
   */
  async collectFullSystemInfo() {
    try {
      const [
        system,
        bios,
        baseboard,
        chassis,
        cpu,
        graphics,
        memory,
        memLayout,
        diskLayout,
        networkInterfaces,
        usbDevices,
        osInfo,
        versions
      ] = await Promise.all([
        si.system(),
        si.bios(),
        si.baseboard(),
        si.chassis(),
        si.cpu(),
        si.graphics(),
        si.mem(),
        si.memLayout(),
        si.diskLayout(),
        si.networkInterfaces(),
        si.usb(),
        si.osInfo(),
        si.versions()
      ]);

      const fullInfo = {
        // System
        hostname: os.hostname(),
        osType: os.type(),
        osPlatform: os.platform(),
        osRelease: os.release(),
        osArch: os.arch(),
        osInfo: {
          distro: osInfo.distro,
          release: osInfo.release,
          codename: osInfo.codename,
          platform: osInfo.platform,
          arch: osInfo.arch,
          kernel: osInfo.kernel,
          build: osInfo.build,
          servicepack: osInfo.servicepack,
          uefi: osInfo.uefi
        },

        // System Hardware
        system: {
          manufacturer: system.manufacturer,
          model: system.model,
          version: system.version,
          serial: system.serial,
          uuid: system.uuid,
          sku: system.sku
        },

        // BIOS
        bios: {
          vendor: bios.vendor,
          version: bios.version,
          releaseDate: bios.releaseDate,
          revision: bios.revision
        },

        // Baseboard
        baseboard: {
          manufacturer: baseboard.manufacturer,
          model: baseboard.model,
          version: baseboard.version,
          serial: baseboard.serial,
          assetTag: baseboard.assetTag
        },

        // Chassis
        chassis: {
          manufacturer: chassis.manufacturer,
          model: chassis.model,
          type: chassis.type,
          version: chassis.version,
          serial: chassis.serial,
          assetTag: chassis.assetTag,
          sku: chassis.sku
        },

        // CPU
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          vendor: cpu.vendor,
          family: cpu.family,
          model: cpu.model,
          stepping: cpu.stepping,
          revision: cpu.revision,
          voltage: cpu.voltage,
          speed: cpu.speed,
          speedMin: cpu.speedMin,
          speedMax: cpu.speedMax,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          processors: cpu.processors,
          socket: cpu.socket,
          cache: cpu.cache
        },

        // Memory
        memory: {
          total: Math.round(memory.total / 1024 / 1024 / 1024 * 100) / 100, // GB
          modules: memLayout.map(mem => ({
            size: Math.round(mem.size / 1024 / 1024 / 1024 * 100) / 100, // GB
            type: mem.type,
            clockSpeed: mem.clockSpeed,
            formFactor: mem.formFactor,
            manufacturer: mem.manufacturer,
            partNum: mem.partNum,
            serialNum: mem.serialNum,
            voltageConfigured: mem.voltageConfigured,
            voltageMin: mem.voltageMin,
            voltageMax: mem.voltageMax,
            bank: mem.bank
          }))
        },

        // Storage
        storage: diskLayout.map(disk => ({
          device: disk.device,
          type: disk.type,
          name: disk.name,
          vendor: disk.vendor,
          size: Math.round(disk.size / 1024 / 1024 / 1024), // GB
          bytesPerSector: disk.bytesPerSector,
          totalCylinders: disk.totalCylinders,
          totalHeads: disk.totalHeads,
          totalSectors: disk.totalSectors,
          totalTracks: disk.totalTracks,
          tracksPerCylinder: disk.tracksPerCylinder,
          sectorsPerTrack: disk.sectorsPerTrack,
          firmwareRevision: disk.firmwareRevision,
          serialNum: disk.serialNum,
          interfaceType: disk.interfaceType,
          smartStatus: disk.smartStatus
        })),

        // Graphics
        graphics: {
          controllers: graphics.controllers.map(gpu => ({
            vendor: gpu.vendor,
            model: gpu.model,
            bus: gpu.bus,
            vram: gpu.vram,
            vramDynamic: gpu.vramDynamic,
            driverVersion: gpu.driverVersion
          })),
          displays: graphics.displays ? graphics.displays.map(display => ({
            vendor: display.vendor,
            model: display.model,
            main: display.main,
            builtin: display.builtin,
            connection: display.connection,
            resolutionX: display.resolutionx,
            resolutionY: display.resolutiony
          })) : []
        },

        // Network
        networkInterfaces: networkInterfaces.map(iface => ({
          name: iface.iface,
          ip4: iface.ip4,
          ip6: iface.ip6,
          mac: iface.mac,
          internal: iface.internal,
          virtual: iface.virtual,
          operstate: iface.operstate,
          type: iface.type,
          duplex: iface.duplex,
          mtu: iface.mtu,
          speed: iface.speed,
          dhcp: iface.dhcp
        })),

        // USB Devices
        usbDevices: usbDevices.map(usb => ({
          id: usb.id,
          name: usb.name,
          type: usb.type,
          manufacturer: usb.manufacturer,
          serialNumber: usb.serialNumber,
          removable: usb.removable
        })),

        // Software Versions
        versions: {
          node: versions.node,
          npm: versions.npm,
          kernel: versions.kernel,
          openssl: versions.openssl,
          systemOpenssl: versions.systemOpenssl,
          git: versions.git,
          gcc: versions.gcc,
          python: versions.python,
          python3: versions.python3,
          pip: versions.pip,
          pip3: versions.pip3,
          java: versions.java,
          gcc: versions.gcc,
          mysql: versions.mysql,
          redis: versions.redis,
          mongodb: versions.mongodb,
          nginx: versions.nginx,
          php: versions.php,
          docker: versions.docker,
          postfix: versions.postfix,
          postgresql: versions.postgresql,
          perl: versions.perl,
          python: versions.python,
          ruby: versions.ruby,
          rust: versions.rust,
          swift: versions.swift,
          golang: versions.golang
        },

        // System uptime
        uptime: Math.round(os.uptime() / 3600 * 100) / 100, // hours

        // Collection timestamp
        collectedAt: new Date()
      };

      this.lastCollection = fullInfo;
      this.cachedInfo = fullInfo;
      return fullInfo;

    } catch (error) {
      logger.error('Error collecting system info', { error: error.message });
      return null;
    }
  }

  /**
   * Get system info (cached if available)
   */
  async getSystemInfo() {
    if (this.cachedInfo && 
        this.lastCollection && 
        (Date.now() - new Date(this.lastCollection.collectedAt).getTime() < this.cacheExpiry)) {
      return this.cachedInfo;
    }

    return await this.collectFullSystemInfo();
  }

  /**
   * Get only USB devices
   */
  async getUSBDevices() {
    try {
      const usbDevices = await si.usb();
      return usbDevices.map(usb => ({
        id: usb.id,
        name: usb.name,
        type: usb.type,
        manufacturer: usb.manufacturer,
        serialNumber: usb.serialNumber,
        removable: usb.removable,
        maxPower: usb.maxPower,
        vendor: usb.vendor,
        productId: usb.productId,
        vendorId: usb.vendorId
      }));
    } catch (error) {
      logger.error('Error getting USB devices', { error: error.message });
      return [];
    }
  }

  /**
   * Monitor USB device changes
   */
  async detectUSBChanges(previousDevices) {
    const currentDevices = await this.getUSBDevices();
    
    const added = currentDevices.filter(curr => 
      !previousDevices.some(prev => prev.id === curr.id)
    );

    const removed = previousDevices.filter(prev =>
      !currentDevices.some(curr => curr.id === prev.id)
    );

    return {
      added,
      removed,
      current: currentDevices,
      hasChanges: added.length > 0 || removed.length > 0
    };
  }

  /**
   * Get basic system summary
   */
  async getSystemSummary() {
    try {
      const [osInfo, cpu, memory, uptime] = await Promise.all([
        si.osInfo(),
        si.cpu(),
        si.mem(),
        Promise.resolve(os.uptime())
      ]);

      return {
        hostname: os.hostname(),
        os: `${osInfo.distro} ${osInfo.release}`,
        platform: osInfo.platform,
        arch: osInfo.arch,
        kernel: osInfo.kernel,
        cpu: `${cpu.manufacturer} ${cpu.brand}`,
        cpuCores: cpu.cores,
        memoryGB: Math.round(memory.total / 1024 / 1024 / 1024 * 100) / 100,
        uptimeHours: Math.round(uptime / 3600 * 100) / 100,
        nodeVersion: process.version
      };
    } catch (error) {
      logger.error('Error getting system summary', { error: error.message });
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cachedInfo = null;
    this.lastCollection = null;
  }
}

module.exports = new SystemInfoCollector();
