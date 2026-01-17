# AI-Powered Task Assignment & Camera Monitoring System
**Architecture Plan - Cloud-Hybrid Approach**

Created: 2026-01-16  
Hardware: Intel Core Ultra 7 155U with NPU  
Approach: Local NPU inference + Google Vision API cloud analysis

---

## 🎯 Project Goals

1. **Automated Task Assignment**: AI agent distributes daily tasks fairly based on rotation, skills, and past performance
2. **Employee Identification**: Camera-based facial recognition via RTSP streams
3. **Operations Monitoring**: Detect stock issues, analyze behavior patterns, identify improvements
4. **Fair Rotation**: Ensure everyone does all tasks over time (zones, fitting rooms, shifts)
5. **Reporting**: Generate insights and recommendations from AI analysis

---

## 🏗️ System Architecture

### Three-Layer Approach

```
┌──────────────────────────────────────────────────────────────┐
│                     Layer 1: Local NPU                       │
│  - Task assignment algorithm (OpenVINO)                      │
│  - Real-time employee facial recognition                    │
│  - Live pose detection (safety monitoring)                  │
│  - Fast inference (<100ms)                                  │
└──────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────┐
│              Layer 2: Node.js Application                    │
│  - API endpoints for AI services                            │
│  - Database integration (PostgreSQL)                        │
│  - MCP server for AI task assignment                       │
│  - RTSP stream handling                                     │
│  - Task scheduling and automation                           │
└──────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────┐
│              Layer 3: Cloud AI Analysis                      │
│  - Google Vision API (stock/shelf analysis)                 │
│  - Behavior pattern analysis (batch processing)             │
│  - Advanced computer vision tasks                           │
│  - Training data generation                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema (See migrations/001_ai_task_assignment_schema.sql)

### New Tables
1. **task_assignment_history** - Tracks all assignments for fairness
2. **employee_task_metrics** - Performance data for AI decisions
3. **ai_assignment_decisions** - Audit log of AI agent actions
4. **employee_skills_preferences** - Skills/preferences for matching
5. **camera_events** - Camera detections and alerts
6. **ai_insights** - AI-generated recommendations

---

## 🤖 Phase 1: AI Task Assignment Agent (2-3 weeks)

### What It Does
- Analyzes past 30-90 days of assignments
- Calculates fairness score for each employee (zone rotation, shift balance)
- Generates daily gameplan assignments automatically
- Considers: skills, preferences, reliability, past performance
- Outputs manager-reviewable assignments

### Technology Stack
**Local Processing (NPU):**
- OpenVINO Toolkit (Intel's recommended successor to NPU library)
- PyTorch or TensorFlow Lite models compiled for NPU
- Python service running as PM2 process

**Integration:**
- MCP Server: `stockroom-ai-assignment`
- API: `/api/ai/task-assignment/generate`
- CLI tool: `npm run generate-gameplan --date=2026-01-17`

### Algorithm Logic

```python
# Pseudocode for AI assignment agent

def generate_fair_assignments(date, employees, settings):
    # 1. Load historical data
    history = load_assignment_history(days=90)
    metrics = load_employee_metrics()
    
    # 2. Calculate fairness scores
    for employee in employees:
        zone_distribution = calculate_zone_frequency(employee, history)
        shift_balance = calculate_shift_balance(employee, history)
        fairness_score = zone_distribution * 0.4 + shift_balance * 0.6
    
    # 3. Optimization constraints
    constraints = {
        'required_sa': settings.required_sa_count,
        'required_boh': settings.required_boh_count,
        'required_mgmt': settings.required_mgmt_count,
        'zones': settings.available_zones,
        'fitting_rooms': settings.fitting_rooms,
        'shifts': settings.shifts
    }
    
    # 4. AI model inference (NPU accelerated)
    assignments = optimize_assignments(
        employees=employees,
        fairness_scores=fairness_scores,
        constraints=constraints,
        model=npu_model
    )
    
    # 5. Return assignments with confidence scores
    return {
        'assignments': assignments,
        'fairness_score': calculate_overall_fairness(assignments),
        'confidence': model_confidence
    }
```

### Files to Create
- `/mcp-servers/stockroom-ai-assignment/server.py` - MCP server
- `/ai-services/task-assignment/agent.py` - Core AI logic
- `/ai-services/task-assignment/models/` - ML models
- `/routes/ai-assignment.js` - API endpoints
- `/public/gameplan-ai-review.html` - Manager approval UI

---

## 📹 Phase 2: Camera RTSP Integration (2 weeks)

### Camera Setup
**Network Configuration:**
- Cameras on local network (10.201.48.x)
- RTSP streams accessible via: `rtsp://camera-ip:554/stream`
- Support for multiple camera brands (Hikvision, Dahua, Axis, etc.)

**Camera Placement Strategy:**
1. **Entrance/Exit**: Employee check-in detection
2. **Stockroom Areas**: Zone occupancy tracking
3. **Fitting Rooms**: Activity monitoring (privacy-compliant)
4. **Packing Station**: Workflow analysis
5. **Sales Floor**: Customer interaction analysis

### Employee Facial Recognition

**Local NPU Processing:**
```
RTSP Stream → Frame Extraction (1 FPS) → Face Detection (NPU) 
              → Face Recognition (NPU) → Database Lookup 
              → Event Logging → Real-time Alert
```

**Technology:**
- OpenVINO pre-trained models: `face-detection-retail-0004`, `face-reidentification-retail-0095`
- Face embeddings stored in PostgreSQL (users table)
- Real-time inference: <50ms per frame

**Privacy & Compliance:**
- Employee consent required (documented in system)
- No recording of audio or sensitive areas
- Data retention: 30 days (configurable)
- Access controls: Admin only

### Implementation

**Python Service:**
```python
# /ai-services/camera-monitor/rtsp_processor.py

import cv2
from openvino.runtime import Core

class RTSPCameraMonitor:
    def __init__(self, camera_config):
        self.ie = Core()
        self.face_detector = self.load_model('face-detection-retail-0004')
        self.face_recognizer = self.load_model('face-reidentification-retail-0095')
        self.cameras = camera_config
        
    def process_stream(self, rtsp_url):
        cap = cv2.VideoCapture(rtsp_url)
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Face detection (NPU accelerated)
            faces = self.detect_faces(frame)
            
            for face in faces:
                # Face recognition
                employee_id = self.recognize_employee(face)
                if employee_id:
                    self.log_event(employee_id, camera_id, timestamp)
```

**Database Integration:**
```sql
-- Store face embeddings for recognition
ALTER TABLE users ADD COLUMN face_embedding VECTOR(128);
CREATE INDEX ON users USING ivfflat (face_embedding vector_cosine_ops);
```

---

## ☁️ Phase 3: Google Vision API Integration (1-2 weeks)

### Use Cases for Cloud AI

1. **Stock Shelf Analysis**
   - Detect empty/messy shelves
   - Identify misplaced items
   - Count inventory visually
   
2. **Behavior Pattern Analysis**
   - Customer traffic flow (heatmaps)
   - Employee efficiency patterns
   - Bottleneck identification

3. **Quality Control**
   - Product condition verification
   - Packaging quality checks
   - Label/tag verification

### Cloud Processing Strategy

**Batch Processing (Not Real-time):**
- Capture frames every 5-15 minutes
- Send to Google Vision API in batches (reduce costs)
- Process during low-activity hours
- Store results in `ai_insights` table

**API Integration:**
```javascript
// /utils/google-vision-processor.js

const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

async function analyzeStockShelf(imagePath) {
  const [result] = await client.objectLocalization(imagePath);
  const objects = result.localizedObjectAnnotations;
  
  // Analyze shelf organization
  const shelfAnalysis = {
    empty_spaces: detectEmptySpaces(objects),
    misplaced_items: detectMisplacements(objects),
    stock_level: estimateStockLevel(objects)
  };
  
  // Generate insights
  if (shelfAnalysis.empty_spaces > 0.3) {
    createInsight({
      type: 'stock_issue',
      severity: 'warning',
      title: 'Low Stock Detected',
      description: `Zone ${zone} has ${shelfAnalysis.empty_spaces * 100}% empty shelf space`,
      recommended_actions: ['Restock from BOH', 'Check inventory levels']
    });
  }
  
  return shelfAnalysis;
}
```

**Cost Optimization:**
- Use Vision API only for complex analysis
- Local NPU for simple tasks (employee ID, pose detection)
- Batch requests to reduce API calls
- Cache results when possible
- Estimated cost: $50-200/month (depending on usage)

---

## 🔧 Implementation Roadmap

### Week 1-2: Database & Core AI Service
- [x] Create database schema
- [ ] Set up OpenVINO environment
- [ ] Install Python dependencies (`openvino`, `torch`, `numpy`)
- [ ] Build basic AI assignment algorithm
- [ ] Create MCP server for task assignment

### Week 3-4: AI Agent Integration
- [ ] Implement fairness scoring algorithm
- [ ] Build API endpoints for AI services
- [ ] Create manager approval UI
- [ ] Test with historical data
- [ ] Deploy as PM2 service

### Week 5-6: Camera RTSP Setup
- [ ] Configure camera network access
- [ ] Implement RTSP stream processor
- [ ] Deploy face detection models to NPU
- [ ] Build employee enrollment system (capture faces)
- [ ] Test real-time recognition accuracy

### Week 7-8: Google Vision Integration
- [ ] Set up Google Cloud project and credentials
- [ ] Build batch image processing pipeline
- [ ] Implement stock shelf analysis
- [ ] Create insights dashboard
- [ ] Test and optimize costs

### Week 9-10: Reporting & Optimization
- [ ] Build AI insights dashboard
- [ ] Generate weekly/monthly reports
- [ ] Fine-tune models based on feedback
- [ ] Manager training and rollout
- [ ] Documentation and handoff

---

## 📦 Required Dependencies

### Python (AI Services)
```bash
pip install openvino openvino-dev opencv-python numpy pillow psycopg2-binary
pip install google-cloud-vision face-recognition scikit-learn
```

### Node.js (API Integration)
```bash
npm install @google-cloud/vision opencv4nodejs sharp
npm install @openvino/node (if available)
```

### System Requirements
- Intel Core Ultra processor (✓ You have it!)
- NPU drivers installed (check: `lspci | grep -i npu`)
- 16GB RAM (✓ You have it!)
- OpenVINO Toolkit 2024.x

---

## 🎓 Teaching Points & Debates

### Why OpenVINO Instead of Archived Library?
**My recommendation**: OpenVINO is Intel's official, actively maintained toolkit. It:
- Supports NPU acceleration
- Has pre-trained models ready to use
- Better documentation and community
- Production-ready

**What do you think?** Are you comfortable learning OpenVINO, or do you want me to explore alternatives?

### Fair Task Assignment Algorithm
**Question for you**: How should we define "fairness"?
- Equal time in each zone?
- Balanced shift distribution?
- Skill-based matching (best person for the job)?
- Preference-based (let employees vote)?

**Debate**: Should AI have final say, or always require manager approval?

### Privacy Concerns
**Critical question**: Have you discussed employee facial recognition with your team?
- Legal requirements vary by location (California CCPA, EU GDPR)
- Employee consent needed
- Clear policies on data usage and retention

**My suggestion**: Start with opt-in system, expand after proving value.

---

## 💰 Estimated Costs

| Component | Monthly Cost |
|-----------|--------------|
| Google Vision API | $50-200 (depends on volume) |
| Cloud Storage (images) | $5-20 |
| Additional compute | $0 (using local NPU) |
| **Total** | **$55-220/month** |

**Cost reduction strategies:**
- Process locally as much as possible
- Use Vision API for complex analysis only
- Batch requests during off-hours
- Compress images before upload

---

## 🚀 Next Steps - Your Decision

**I need you to confirm:**

1. **Phase 1 Priority**: Start with AI task assignment or camera integration?
2. **Manager Approval**: Should AI suggestions require approval, or auto-publish?
3. **Camera Budget**: How many cameras? RTSP access confirmed?
4. **Google Cloud**: Do you have a Google Cloud account? Need help setting up?
5. **Timeline**: Is 10 weeks realistic, or do you need faster?

**Let me know your thoughts, and I'll start building Phase 1 immediately!**

---

## 📝 Files Created
- `/db/migrations/001_ai_task_assignment_schema.sql` - Database schema
- `/docs/AI_SYSTEM_ARCHITECTURE.md` - This document
