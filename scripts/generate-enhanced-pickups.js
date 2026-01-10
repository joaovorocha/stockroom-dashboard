const fs = require('fs');
const path = require('path');

// Real SF Union Square employee names
const employees = {
  styleAdvisors: [
    { id: "sa_001", name: "Alexandra Martinez", active: true },
    { id: "sa_002", name: "James Richardson", active: true },
    { id: "sa_003", name: "Sophie Chen", active: true }
  ],
  tailors: [
    { id: "tailor_001", name: "Maria Gonzalez", active: true, specialty: "Suits & Jackets" },
    { id: "tailor_002", name: "Roberto Silva", active: true, specialty: "Alterations" },
    { id: "tailor_003", name: "Carlos Mendez", active: true, specialty: "Custom & Complex" }
  ],
  bohTeam: [
    { id: "boh_001", name: "Michael Torres", role: "BOH Manager" },
    { id: "boh_002", name: "David Kim", role: "BOH Associate" },
    { id: "boh_003", name: "Jessica Wong", role: "BOH Associate" }
  ]
};

// Generate enhanced pickup data
const pickupsData = {
  lastSync: new Date().toISOString(),
  stats: {
    total: 15,
    ready: 6,
    inProduction: 6,
    overdue: 3,
    inRack: 6,
    assignedForPickup: 6,
    needsMeasurement: 3
  },
  employees,
  pickups: [
    // Ready pickups in rack
    {
      id: "pickup_001",
      customer: "Sarah Johnson",
      phone: "+1 (415) 234-5678",
      styleAdvisor: "Alexandra Martinez",
      tailor: "Maria Gonzalez",
      bohContact: "Michael Torres",
      waitwhileId: "ww_12345abc",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_12345abc",
      items: [
        {
          description: "Navy Blazer",
          service: "Sleeve Shortening",
          sku: "BLZ-2301",
          rfidTag: "RFID_BLZ_2301_001"
        }
      ],
      status: "ready",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "A-12",
        assignedForPickup: true,
        lastScanned: "2026-01-10T14:30:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2026-01-09T14:00:00Z"
      },
      daysWaiting: 3,
      createdAt: "2026-01-07T10:30:00Z",
      readyAt: "2026-01-09T14:00:00Z",
      estimatedReady: null,
      lastReminderSent: "2026-01-09",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "in-rack"],
      notes: "Customer notified via SMS",
      alert: null
    },
    {
      id: "pickup_002",
      customer: "Michael Chen",
      phone: "+1 (415) 876-5432",
      styleAdvisor: "James Richardson",
      tailor: "Roberto Silva",
      bohContact: "David Kim",
      waitwhileId: "ww_67890def",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_67890def",
      items: [
        {
          description: "Gray Wool Suit",
          service: "Full Alteration",
          sku: "SUT-4402",
          rfidTag: "RFID_SUT_4402_015"
        },
        {
          description: "White Dress Shirt",
          service: "Collar Repair",
          sku: "SHT-1105",
          rfidTag: "RFID_SHT_1105_033"
        }
      ],
      status: "ready",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "B-08",
        assignedForPickup: true,
        lastScanned: "2026-01-10T09:15:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2026-01-05T16:00:00Z"
      },
      daysWaiting: 8,
      createdAt: "2026-01-02T09:15:00Z",
      readyAt: "2026-01-05T16:00:00Z",
      estimatedReady: null,
      lastReminderSent: "2026-01-08",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "multi-item", "in-rack"],
      notes: "Called customer Jan 8",
      alert: null
    },
    {
      id: "pickup_003",
      customer: "Lisa Thompson",
      phone: "+1 (415) 765-4321",
      styleAdvisor: "James Richardson",
      tailor: "Roberto Silva",
      bohContact: "David Kim",
      waitwhileId: "ww_777lll888",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_777lll888",
      items: [
        {
          description: "Burgundy Blazer",
          service: "Button Replacement",
          sku: "BLZ-3303",
          rfidTag: "RFID_BLZ_3303_012"
        }
      ],
      status: "ready",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "A-18",
        assignedForPickup: true,
        lastScanned: "2026-01-10T13:00:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2026-01-10T12:00:00Z"
      },
      daysWaiting: 1,
      createdAt: "2026-01-09T11:00:00Z",
      readyAt: "2026-01-10T12:00:00Z",
      estimatedReady: null,
      lastReminderSent: "2026-01-10",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "in-rack", "express"],
      notes: "Express service - customer notified immediately",
      alert: null
    },
    {
      id: "pickup_004",
      customer: "Daniel Kim",
      phone: "+1 (415) 555-2468",
      styleAdvisor: "Sophie Chen",
      tailor: "Maria Gonzalez",
      bohContact: "Jessica Wong",
      waitwhileId: "ww_999mmm000",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_999mmm000",
      items: [
        {
          description: "Olive Green Chinos",
          service: "Hem",
          sku: "CHI-4404",
          rfidTag: "RFID_CHI_4404_023"
        }
      ],
      status: "ready",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "B-22",
        assignedForPickup: true,
        lastScanned: "2026-01-09T16:30:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2026-01-09T16:00:00Z"
      },
      daysWaiting: 2,
      createdAt: "2026-01-08T10:00:00Z",
      readyAt: "2026-01-09T16:00:00Z",
      estimatedReady: null,
      lastReminderSent: "2026-01-10",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "in-rack"],
      notes: "Simple hem - quick turnaround",
      alert: null
    },
    {
      id: "pickup_005",
      customer: "Rachel Green",
      phone: "+1 (415) 333-7777",
      styleAdvisor: "Alexandra Martinez",
      tailor: "Carlos Mendez",
      bohContact: "Michael Torres",
      waitwhileId: "ww_111nnn222",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_111nnn222",
      items: [
        {
          description: "Silk Blouse",
          service: "Size Adjustment",
          sku: "BLS-5505",
          rfidTag: "RFID_BLS_5505_031"
        },
        {
          description: "Black Pencil Skirt",
          service: "Waist Take-In",
          sku: "SKT-6606",
          rfidTag: "RFID_SKT_6606_042"
        }
      ],
      status: "ready",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "C-05",
        assignedForPickup: true,
        lastScanned: "2026-01-10T10:00:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2026-01-10T09:30:00Z"
      },
      daysWaiting: 3,
      createdAt: "2026-01-07T14:00:00Z",
      readyAt: "2026-01-10T09:30:00Z",
      estimatedReady: null,
      lastReminderSent: "2026-01-10",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "multi-item", "in-rack"],
      notes: "Both items ready - customer happy with fit",
      alert: null
    },
    {
      id: "pickup_006",
      customer: "Emily Rodriguez",
      phone: "+1 (415) 345-6789",
      styleAdvisor: "Sophie Chen",
      tailor: null,
      productionTeam: "Custom Made - Factory",
      bohContact: "Jessica Wong",
      waitwhileId: "ww_111aaa222",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_111aaa222",
      items: [
        {
          description: "Black Evening Dress",
          service: "Custom Made",
          sku: "DRS-CM-789",
          rfidTag: "RFID_DRS_CM_789_002"
        }
      ],
      status: "in_production",
      state: "WAITING",
      pickupLocation: {
        inRack: false,
        rackPosition: null,
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: {
        stage: "production",
        receivedFrom: "warehouse",
        completedStages: ["received", "measuring", "production"],
        currentStep: "Custom fabrication at factory",
        lastUpdated: "2026-01-10T10:00:00Z"
      },
      daysWaiting: 18,
      createdAt: "2025-12-23T11:00:00Z",
      readyAt: null,
      estimatedReady: "2026-01-15",
      lastReminderSent: null,
      matchedInSystem: true,
      tags: ["custom-made", "production"],
      notes: "Production team: 5 days remaining",
      alert: null
    },
    {
      id: "pickup_007",
      customer: "Amanda Chen",
      phone: "+1 (415) 678-9012",
      styleAdvisor: "Alexandra Martinez",
      tailor: "Roberto Silva",
      bohContact: "Michael Torres",
      waitwhileId: "ww_999hhh000",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_999hhh000",
      items: [
        {
          description: "Charcoal Trousers",
          service: "Waist Adjustment",
          sku: "TRS-9903",
          rfidTag: null
        }
      ],
      status: "in_production",
      state: "WAITING",
      pickupLocation: {
        inRack: false,
        rackPosition: null,
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: {
        stage: "measuring",
        receivedFrom: "warehouse",
        completedStages: ["received", "measuring"],
        currentStep: "Awaiting tailor assignment for measurements",
        needsMeasurement: true,
        lastUpdated: "2026-01-10T08:00:00Z"
      },
      daysWaiting: 2,
      createdAt: "2026-01-08T14:00:00Z",
      readyAt: null,
      estimatedReady: "2026-01-13",
      lastReminderSent: null,
      matchedInSystem: true,
      tags: ["alteration", "production", "needs-measurement"],
      notes: "Received from warehouse - needs customer measurement",
      alert: null
    },
    {
      id: "pickup_008",
      customer: "Patricia Wong",
      phone: "+1 (415) 890-1234",
      styleAdvisor: "James Richardson",
      tailor: "Maria Gonzalez",
      bohContact: "David Kim",
      waitwhileId: "ww_111iii222",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_111iii222",
      items: [
        {
          description: "Navy Wool Suit",
          service: "Full Alteration Package",
          sku: "SUT-8804",
          rfidTag: "RFID_SUT_8804_045"
        }
      ],
      status: "in_production",
      state: "WAITING",
      pickupLocation: {
        inRack: false,
        rackPosition: null,
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: {
        stage: "production",
        receivedFrom: "warehouse",
        completedStages: ["received", "measuring", "production"],
        currentStep: "Tailor: Jacket sleeve adjustments in progress",
        assignedTailor: "Maria Gonzalez",
        lastUpdated: "2026-01-10T11:30:00Z"
      },
      daysWaiting: 5,
      createdAt: "2026-01-05T10:00:00Z",
      readyAt: null,
      estimatedReady: "2026-01-12",
      lastReminderSent: null,
      matchedInSystem: true,
      tags: ["alteration", "production", "complex"],
      notes: "Complex alteration - Maria working on sleeves and pants",
      alert: null
    },
    {
      id: "pickup_009",
      customer: "Christopher Lee",
      phone: "+1 (415) 321-6547",
      styleAdvisor: "Sophie Chen",
      tailor: "Carlos Mendez",
      bohContact: "Jessica Wong",
      waitwhileId: "ww_333jjj444",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_333jjj444",
      items: [
        {
          description: "Black Tuxedo",
          service: "Complete Alteration",
          sku: "TUX-1101",
          rfidTag: "RFID_TUX_1101_008"
        }
      ],
      status: "in_production",
      state: "WAITING",
      pickupLocation: {
        inRack: false,
        rackPosition: null,
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: {
        stage: "quality_check",
        receivedFrom: "warehouse",
        completedStages: ["received", "measuring", "production", "quality_check"],
        currentStep: "Final quality inspection before pickup rack",
        assignedTailor: "Carlos Mendez",
        lastUpdated: "2026-01-10T15:00:00Z"
      },
      daysWaiting: 4,
      createdAt: "2026-01-06T09:00:00Z",
      readyAt: null,
      estimatedReady: "2026-01-11",
      lastReminderSent: null,
      matchedInSystem: true,
      tags: ["alteration", "production", "quality-check"],
      notes: "Tuxedo in final QC - will move to rack tomorrow",
      alert: null
    },
    {
      id: "pickup_010",
      customer: "Thomas Anderson",
      phone: "+1 (415) 432-1098",
      styleAdvisor: "Alexandra Martinez",
      tailor: null,
      bohContact: "Michael Torres",
      waitwhileId: "ww_555kkk666",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_555kkk666",
      items: [
        {
          description: "Gray Overcoat",
          service: "Sleeve & Hem",
          sku: "COT-2202",
          rfidTag: null
        }
      ],
      status: "in_production",
      state: "WAITING",
      pickupLocation: {
        inRack: false,
        rackPosition: null,
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: {
        stage: "received",
        receivedFrom: "warehouse",
        completedStages: ["received"],
        currentStep: "Just received from warehouse - awaiting customer measurement",
        needsMeasurement: true,
        lastUpdated: "2026-01-10T16:00:00Z"
      },
      daysWaiting: 0,
      createdAt: "2026-01-10T16:00:00Z",
      readyAt: null,
      estimatedReady: "2026-01-17",
      lastReminderSent: null,
      matchedInSystem: true,
      tags: ["alteration", "production", "needs-measurement", "just-received"],
      notes: "JUST RECEIVED - Customer needs to come in for measurements",
      alert: null
    },
    {
      id: "pickup_011",
      customer: "Steven Park",
      phone: "+1 (415) 888-4444",
      styleAdvisor: "James Richardson",
      tailor: null,
      bohContact: "David Kim",
      waitwhileId: "ww_333ooo444",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_333ooo444",
      items: [
        {
          description: "Three-Piece Suit",
          service: "Complete Tailoring",
          sku: "SUT-7707",
          rfidTag: null
        }
      ],
      status: "in_production",
      state: "WAITING",
      pickupLocation: {
        inRack: false,
        rackPosition: null,
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: {
        stage: "received",
        receivedFrom: "warehouse",
        completedStages: ["received"],
        currentStep: "Just arrived - customer scheduled for fitting Monday",
        needsMeasurement: true,
        lastUpdated: "2026-01-10T14:00:00Z"
      },
      daysWaiting: 0,
      createdAt: "2026-01-10T14:00:00Z",
      readyAt: null,
      estimatedReady: "2026-01-20",
      lastReminderSent: null,
      matchedInSystem: true,
      tags: ["alteration", "production", "needs-measurement", "just-received", "complex"],
      notes: "JUST RECEIVED - Full suit alteration - Fitting scheduled 1/13",
      alert: null
    },
    // Overdue pickups
    {
      id: "pickup_012",
      customer: "David Williams",
      phone: "+1 (415) 987-6543",
      styleAdvisor: "Alexandra Martinez",
      tailor: "Carlos Mendez",
      bohContact: "Michael Torres",
      waitwhileId: "ww_333ccc444",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_333ccc444",
      items: [
        {
          description: "Leather Jacket",
          service: "Zipper Replacement",
          sku: "JKT-5601",
          rfidTag: "RFID_JKT_5601_019"
        }
      ],
      status: "overdue_30",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "C-15",
        assignedForPickup: true,
        lastScanned: "2026-01-05T14:00:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2025-12-10T10:00:00Z"
      },
      daysWaiting: 35,
      createdAt: "2025-12-06T14:20:00Z",
      readyAt: "2025-12-10T10:00:00Z",
      estimatedReady: null,
      lastReminderSent: "2026-01-05",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "in-rack"],
      notes: "Multiple reminders sent, no response",
      alert: {
        type: "OVERDUE_30_DAYS",
        severity: "medium",
        message: "Item ready for 35 days. Follow up recommended."
      }
    },
    {
      id: "pickup_013",
      customer: "Jennifer Martinez",
      phone: "+1 (415) 456-7890",
      styleAdvisor: "James Richardson",
      tailor: "Maria Gonzalez",
      bohContact: "David Kim",
      waitwhileId: "ww_555eee666",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_555eee666",
      items: [
        {
          description: "Camel Coat",
          service: "Hem & Button Replacement",
          sku: "COT-3301",
          rfidTag: "RFID_COT_3301_007"
        }
      ],
      status: "overdue_60",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "D-03",
        assignedForPickup: true,
        lastScanned: "2025-12-15T09:00:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "production",
        completedStages: ["received", "measuring", "production", "quality_check", "ready"],
        lastUpdated: "2025-11-08T15:30:00Z"
      },
      daysWaiting: 68,
      createdAt: "2025-11-03T09:45:00Z",
      readyAt: "2025-11-08T15:30:00Z",
      estimatedReady: null,
      lastReminderSent: "2025-12-15",
      matchedInSystem: true,
      tags: ["alteration", "pickup", "in-rack"],
      notes: "Customer traveling, will pick up mid-January",
      alert: {
        type: "OVERDUE_60_DAYS",
        severity: "high",
        message: "Item ready for 68 days. Urgent follow-up needed."
      }
    },
    {
      id: "pickup_014",
      customer: "Robert Taylor",
      phone: "+1 (415) 234-9876",
      styleAdvisor: "Sophie Chen",
      tailor: null,
      bohContact: "Jessica Wong",
      waitwhileId: "ww_777ggg888",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_777ggg888",
      items: [
        {
          description: "Brown Loafers",
          service: "Sole Repair",
          sku: "SHO-7702",
          rfidTag: "RFID_SHO_7702_021"
        }
      ],
      status: "overdue_90",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "E-11",
        assignedForPickup: true,
        lastScanned: "2025-12-20T11:00:00Z"
      },
      alterationWorkflow: {
        stage: "ready",
        receivedFrom: "external_repair",
        completedStages: ["received", "external_repair", "quality_check", "ready"],
        lastUpdated: "2025-10-12T11:00:00Z"
      },
      daysWaiting: 94,
      createdAt: "2025-10-08T13:00:00Z",
      readyAt: "2025-10-12T11:00:00Z",
      estimatedReady: null,
      lastReminderSent: "2025-12-20",
      matchedInSystem: true,
      tags: ["repair", "pickup", "in-rack"],
      notes: "FINAL REMINDER SENT - Return to shelf process starting",
      alert: {
        type: "OVERDUE_90_DAYS",
        severity: "critical",
        message: "Item ready for 94 days. Return to shelf process required."
      }
    },
    // Orphaned pickup
    {
      id: "pickup_015",
      customer: "Unknown Customer",
      phone: "Not in system",
      styleAdvisor: null,
      tailor: null,
      bohContact: null,
      waitwhileId: "ww_orphan_001",
      waitwhileUrl: "https://app.waitwhile.com/visits/ww_orphan_001",
      items: [
        {
          description: "Blue Dress",
          service: "Unknown",
          sku: "UNKNOWN",
          rfidTag: null
        }
      ],
      status: "orphaned",
      state: "SERVED",
      pickupLocation: {
        inRack: true,
        rackPosition: "Z-99",
        assignedForPickup: false,
        lastScanned: null
      },
      alterationWorkflow: null,
      daysWaiting: 12,
      createdAt: "2025-12-29T00:00:00Z",
      readyAt: "2026-01-02T00:00:00Z",
      estimatedReady: null,
      lastReminderSent: null,
      matchedInSystem: false,
      tags: ["pickup", "orphaned"],
      notes: "Found in WaitWhile but no matching order in system",
      alert: {
        type: "ORPHANED",
        severity: "high",
        message: "Pickup in WaitWhile but not tracked in stockroom system. Investigation needed."
      }
    }
  ]
};

// Write to file
const outputPath = path.join(__dirname, '../data/pickups-mock.json');
fs.writeFileSync(outputPath, JSON.stringify(pickupsData, null, 2));

console.log('✅ Enhanced pickup data generated successfully!');
console.log(`📊 Total pickups: ${pickupsData.pickups.length}`);
console.log(`👔 Style Advisors: ${employees.styleAdvisors.map(sa => sa.name).join(', ')}`);
console.log(`✂️ Tailors: ${employees.tailors.map(t => t.name).join(', ')}`);
console.log(`📦 BOH Team: ${employees.bohTeam.map(b => b.name).join(', ')}`);
console.log(`\n📍 Pickup locations:`);
console.log(`   - In rack: ${pickupsData.stats.inRack}`);
console.log(`   - Assigned for pickup: ${pickupsData.stats.assignedForPickup}`);
console.log(`   - Needs measurement: ${pickupsData.stats.needsMeasurement}`);
