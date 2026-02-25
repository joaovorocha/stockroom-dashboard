# AI-Powered Automation Master Plan
**Stockroom Dashboard - Suit Supply**  
**Created:** January 16, 2026  
**Owner:** Victor Rocha (Stockroom Manager)  
**Hardware:** Intel Core Ultra 7 155U with NPU

---

## 🎯 Vision Statement

**Automate our lives at Suit Supply** through AI-powered task assignment, camera-based monitoring, and intelligent radio integration. Reduce manager workload, ensure fair employee rotation, and catch operational issues before they become problems.

---

## ✅ Phase 1: AI Task Assignment (CURRENT - IN PROGRESS)

### Goals
- Eliminate 20-30 minutes of daily manager time spent on task assignments
- Ensure fair rotation: everyone does everything over time
- No complex skill grading - all employees are trusted and capable
- Manager approval required - AI suggests, humans decide

### Completed Work ✓
- [x] Database schema (6 new tables for AI tracking)
- [x] Fair rotation algorithm (Python, 90-day history analysis)
- [x] Algorithm explanation page (public/ai-algorithm-explained.html)
- [x] Python dependencies installed (psycopg2, numpy)

### In Progress 🔨
- [ ] MCP Server for AI task assignment
- [ ] API endpoints (`/api/ai/generate-gameplan`)
- [ ] Manager review UI (draft approval workflow)
- [ ] Integration with existing gameplan system

### Technical Details

#### Database Tables Created
1. **task_assignment_history** - Historical assignments for fairness
2. **employee_task_metrics** - Performance data (completion rates, zone counts)
3. **ai_assignment_decisions** - Audit log of AI decisions
4. **employee_skills_preferences** - Skills & preferences (future use)
5. **camera_events** - Camera detections (Phase 2)
6. **ai_insights** - AI-generated recommendations

#### Fair Rotation Algorithm Logic
```
1. Load 90 days of assignment history
2. Calculate fairness scores (0=never assigned, 1=always assigned)
3. Assign zones/rooms/shifts to employees with LOWEST scores
4. Ensure no zone is over-assigned
5. Generate draft with fairness score (0-1)
6. Manager reviews and approves
```

**Key Principle:** Equal rotation > Skill matching  
**Why:** Everyone should experience all areas. No favoritism.

#### Files Created
- `/db/migrations/001_ai_task_assignment_schema.sql` - Database schema
- `/ai-services/task-assignment/fair_rotation_agent.py` - Core algorithm
- `/public/ai-algorithm-explained.html` - Transparency page
- `/docs/AI_SYSTEM_ARCHITECTURE.md` - Full technical docs

### Estimated Timeline
- **Week 1-2:** MCP server + API endpoints (CURRENT)
- **Week 3:** Manager review UI + integration testing
- **Week 4:** Production deployment + team training

---

## 📅 Phase 2: Camera RTSP Integration (LOCAL ONLY)

### Goals
- Employee identification via facial recognition (privacy-compliant)
- Detect who is accessing stockroom areas
- Monitor stock organization issues
- All processing happens locally on NPU (no cloud)

### Privacy & Compliance
- ✅ Employees have been informed about facial recognition
- ✅ Local processing only (no cloud uploads)
- 📋 Employee consent documentation (TODO)
- 🔒 Data retention: 30 days maximum
- 👥 Access controls: Admin/Manager only

### Network Configuration
- Cameras on local network: 10.201.48.x subnet
- RTSP streams: `rtsp://camera-ip:554/stream`
- Support multiple brands: Hikvision, Dahua, Axis

### Camera Placement Strategy
1. **Entrance/Exit** - Employee check-in tracking
2. **Stockroom Zones** - Zone occupancy monitoring
3. **Fitting Rooms** - Activity tracking (privacy-compliant)
4. **Packing Station** - Workflow analysis
5. **Sales Floor** - Customer interaction patterns

### Technology Stack
- **OpenVINO Models:** 
  - `face-detection-retail-0004` (face detection)
  - `face-reidentification-retail-0095` (recognition)
- **Processing:** Real-time NPU inference (<50ms per frame)
- **Storage:** Face embeddings in PostgreSQL (users table)

### Planned Features
- Real-time employee identification
- Zone occupancy heatmaps
- Alert system for unauthorized access
- Integration with task assignment (verify employees are in assigned zones)

### Files to Create
- `/ai-services/camera-monitor/rtsp_processor.py` - RTSP stream handler
- `/ai-services/camera-monitor/face_recognition.py` - Face detection/recognition
- `/public/camera-enrollment.html` - Employee face enrollment UI
- `/routes/camera-events.js` - API endpoints

### Estimated Timeline
- **Week 5-6:** RTSP integration + face detection
- **Week 7:** Employee enrollment system
- **Week 8:** Testing + privacy audit

---

## 📻 Phase 3: Radio AI Integration (EXCITING NEW IDEA!)

### Goals
1. **Speaker Identification** - "Who just said that?"
2. **Auto-Notifications** - Text/push when someone is called
3. **WaitWhile Pickup Alerts** - Auto-announce forgotten pickups
4. **Network Audio Triggers** - Play alerts over store speakers

### Current Radio System
- Python-based radio monitoring (already running)
- Transcription service (radio_service.py, radio-transcriber)
- UDP communication (ports 7355, 7356)
- Real-time audio streaming

### Planned Enhancements

#### 1. Speaker Diarization (Who is speaking?)
- Add AI speaker separation to existing transcription
- Build voice profiles for each employee
- Match speakers to employee database
- **Use case:** "Manager Victor just called - text him back"

#### 2. Automated Notifications
- Parse radio transcripts for names/calls
- "John, you're needed in Zone A" → Send SMS/push to John
- Integration options:
  - Twilio for SMS
  - PWA push notifications
  - In-app notifications

#### 3. WaitWhile Pickup Alerts
- Monitor WaitWhile pickup queue
- Trigger alert when pickup sits too long (threshold: 15 minutes?)
- Play loud announcement over network speakers
- **Format:** "ATTENTION: Pickup for customer [NAME] is ready at the rack!"

#### 4. Network Audio Triggers
- Use network-attached speakers (or existing radio system)
- Trigger audio playback remotely
- Zone-specific announcements possible

### Questions to Answer
- [ ] Do we have network speakers or just radios?
- [ ] Employees: Company phones or personal? (for SMS)
- [ ] WaitWhile forgotten pickup threshold? (15 min? 30 min?)
- [ ] Speaker enrollment: How to capture voice samples?

### Technology Stack
- **Speaker Diarization:** pyannote.audio (open source)
- **Voice Matching:** Speaker embeddings + cosine similarity
- **SMS:** Twilio API (pay-per-message)
- **Push Notifications:** PWA service workers
- **Audio Playback:** Network audio streaming (RTSP out or HTTP audio)

### Files to Create
- `/ai-services/radio-ai/speaker_diarization.py` - Speaker separation
- `/ai-services/radio-ai/voice_profiles.py` - Employee voice matching
- `/ai-services/radio-ai/notification_service.py` - SMS/push handler
- `/ai-services/radio-ai/pickup_monitor.py` - WaitWhile integration
- `/routes/radio-ai.js` - API endpoints

### Estimated Timeline
- **Week 9-10:** Speaker diarization + voice profiles
- **Week 11:** Notification system (SMS + push)
- **Week 12:** WaitWhile pickup alerts + network audio

---

## ☁️ Phase 4: Google Vision API Integration (CLOUD - MINIMAL USE)

### Budget Constraints
- Initial credits: $300 (Google Cloud)
- Target spend: $0-50/month (use credits first)
- Only use cloud for complex analysis (not simple tasks)

### Use Cases for Cloud AI

#### 1. Stock Shelf Analysis (Batch Processing)
- Capture frames every 15 minutes (not real-time)
- Detect empty/messy shelves
- Identify misplaced items
- Count inventory visually
- **Cost optimization:** Batch process during off-hours

#### 2. Behavior Pattern Analysis (Weekly Reports)
- Customer traffic heatmaps
- Employee efficiency patterns
- Bottleneck identification
- **Frequency:** Weekly batch, not real-time

#### 3. Quality Control (On-Demand)
- Product condition verification
- Packaging quality checks
- Label/tag verification
- **Trigger:** Manual or scheduled

### Cost Optimization Strategy
- ✅ Local NPU for real-time tasks (employee ID, pose detection)
- ☁️ Cloud only for complex analysis
- 📦 Batch requests (reduce API calls)
- 💾 Cache results
- 📊 Monitor costs weekly

### Estimated Costs
| Service | Monthly Cost |
|---------|--------------|
| Vision API (1000 images/month) | $15-50 |
| Cloud Storage | $5-10 |
| **Total** | **$20-60/month** |

### Files to Create
- `/utils/google-vision-processor.js` - Vision API integration
- `/ai-services/vision-batch/shelf_analyzer.py` - Shelf analysis
- `/ai-services/vision-batch/batch_processor.py` - Batch job runner
- `/public/ai-insights-dashboard.html` - Insights UI

### Estimated Timeline
- **Week 13-14:** Vision API integration + shelf analysis
- **Week 15:** Insights dashboard + reporting

---

## 🗓️ Overall Project Timeline

### Month 1 (Weeks 1-4) - CURRENT
- ✅ **Week 1:** Database + Fair Rotation Algorithm
- 🔨 **Week 2:** MCP Server + API (IN PROGRESS)
- **Week 3:** Manager Review UI + Testing
- **Week 4:** Production Deployment + Training

### Month 2 (Weeks 5-8)
- **Week 5-6:** Camera RTSP Integration
- **Week 7:** Employee Face Enrollment
- **Week 8:** Camera Testing + Privacy Audit

### Month 3 (Weeks 9-12)
- **Week 9-10:** Radio AI + Speaker Diarization
- **Week 11:** Notification System (SMS/Push)
- **Week 12:** WaitWhile Pickup Alerts

### Month 4 (Weeks 13-16)
- **Week 13-14:** Google Vision API (Minimal Use)
- **Week 15:** AI Insights Dashboard
- **Week 16:** Final Testing + Documentation

---

## 🎓 Key Principles & Philosophy

### 1. Fairness First
- No favoritism in task assignments
- Everyone experiences all areas
- No complex skill grading (everyone is capable)
- Transparency in AI decisions

### 2. Privacy & Ethics
- Employee consent required
- Local processing when possible
- Clear data retention policies
- Access controls enforced

### 3. Manager Empowerment
- AI suggests, humans decide
- Never fully automated without approval
- Clear explanations of AI reasoning
- Easy override mechanisms

### 4. Continuous Improvement
- Log all AI decisions for auditing
- Learn from manager overrides
- Regular fairness score monitoring
- Iterative enhancement based on feedback

### 5. Cost Consciousness
- Use local NPU when possible
- Minimize cloud API calls
- Batch processing for efficiency
- Monitor costs weekly

---

## 📊 Success Metrics

### Quantitative
- **Time Saved:** 20-30 minutes/day on task assignment
- **Fairness Score:** Target >0.90 (very fair rotation)
- **Manager Approval Rate:** >80% (AI suggestions accepted)
- **Cost:** <$100/month cloud spend
- **Response Time:** <100ms for AI task generation

### Qualitative
- Employee satisfaction with fair rotation
- Manager confidence in AI suggestions
- Operational issues caught early
- Reduced forgotten pickups

---

## 🚀 Current Status (January 16, 2026)

### What's Live ✓
- Database schema (6 AI tables)
- Fair rotation algorithm (Python)
- Algorithm explanation page
- Python dependencies installed

### Next Up 🔨
- MCP Server for task assignment
- Manager review UI
- API integration with gameplan

### Blockers 🚧
- None currently

### Questions/Decisions Needed
- [ ] Radio: Network speakers available?
- [ ] Radio: Employee phone numbers for SMS?
- [ ] Camera: Specific camera models/IPs?
- [ ] WaitWhile: Forgotten pickup threshold time?

---

## 💡 Future Ideas (Beyond Initial Scope)

### Nice-to-Have Features
1. **Employee Preference Learning**
   - AI learns from manual overrides
   - Soft preferences (not hard rules)
   - "John seems to prefer morning shifts" → suggest but don't enforce

2. **Predictive Staffing**
   - Analyze historical busy periods
   - Suggest staffing levels based on forecasted foot traffic
   - Integration with sales data

3. **Task Completion Tracking**
   - RFID scans confirm task completion
   - Auto-update metrics in real-time
   - Performance dashboards

4. **Cross-Store Learning**
   - Share fairness algorithms across stores
   - Best practices from high-performing locations
   - Benchmarking metrics

5. **Voice Control**
   - "Alexa, show me today's gameplan"
   - "Alexa, who's assigned to Zone A?"
   - Radio integration for hands-free queries

---

## 📚 Resources & Documentation

### Code Locations
- **AI Services:** `/var/www/stockroom-dashboard/ai-services/`
- **MCP Servers:** `/var/www/stockroom-dashboard/mcp-servers/`
- **Database:** PostgreSQL on localhost:5432
- **Public UI:** `/var/www/stockroom-dashboard/public/`
- **API Routes:** `/var/www/stockroom-dashboard/routes/`

### Documentation
- [AI System Architecture](docs/AI_SYSTEM_ARCHITECTURE.md) - Full technical specs
- [Algorithm Explained](public/ai-algorithm-explained.html) - User-facing docs
- [Comprehensive System Docs](../docs/server/COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) - System overview

### External Resources
- OpenVINO Toolkit: https://github.com/openvinotoolkit/openvino
- Google Vision API: https://cloud.google.com/vision/docs
- Pyannote Audio (Speaker Diarization): https://github.com/pyannote/pyannote-audio

---

## 👥 Team & Stakeholders

**Owner:** Victor Rocha (Stockroom Manager)  
**Development:** AI Assistant (GitHub Copilot)  
**Approvers:** Store Management  
**Users:** All Suit Supply employees  

---

## 📝 Change Log

- **2026-01-16:** Initial plan created
- **2026-01-16:** Phase 1 foundation complete (DB + algorithm)
- **2026-01-16:** Algorithm explanation page published
- **Next:** MCP server + Manager UI (in progress)

---

**This is a living document. Update as plans evolve.**
