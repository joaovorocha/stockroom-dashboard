# CTCSS/DCS Integration Status for Motorola CLP446e

## ✅ Completed

### Phase 1: Code Tables (100%)
- **Extracted** 39 CTCSS codes (67.0 - 250.3 Hz) from CLP446e manual
- **Extracted** 83 DCS codes (023 - 754) + 83 inverted codes = 166 total DCS
- **Created** `radio/ctcss-dcs-codes.json` with complete lookup tables
- **API endpoint** `/api/radio/privacy-codes` serves codes to frontend

### Phase 2: CTCSS Detection (90%)
- **Goertzel detector** already implemented in radio_service.py (line 1403)
- **300 Hz LPF** pre-filtering for sub-audio isolation (line 577)
- **Live metering** outputs `privacy.mode`, `privacy.ratio`, `privacy.power` (line 1619-1624)
- **Threshold tuning** documented: 0.08 ratio, 600ms hold time
- **TODO comments** added referencing CLP446e frequencies

#### CTCSS How It Works:
1. Audio filtered through 300 Hz lowpass (removes voice, keeps tone)
2. Goertzel algorithm detects specific tone frequency (e.g., 131.8 Hz)
3. Tone power ratio > 0.08 threshold → squelch opens
4. 600ms hold time prevents flutter during weak signals

#### Current Settings:
```python
# radio_service.py line 577
ctcss_lp = FirFilter(make_fir_lowpass(num_taps=161, cutoff_hz=300.0, fs_hz=audio_fs))

# Line 1412: Detection threshold
if (tp > 1e-4) and (tone_ratio > 0.08):
    tone_match = True
    tone_hold_until = now_t + 0.6  # 600ms hold
```

### Phase 3: DCS Decoder Stub (20%)
- **Specification documented** in `radio/dcs_decoder.py`
- **DCS parameters**: 134.4 bps FSK, 23-bit Golay codeword
- **Code lookup table**: All 83 DCS codes mapped (octal)
- **Stub class** `DCSDecoder` with method signatures
- **Current behavior**: DCS enabled = always pass (line 1426: `tone_match = True`)

---

## ⚠️ TODO

### Phase 4: Complete DCS Decoder (Remaining ~80%)

#### Required Components:
1. **Band-pass filter (50-300 Hz)**
   - Isolate sub-audio DCS signal from voice
   - Use scipy.signal.butter() or custom FIR

2. **FSK Demodulator**
   - Mark frequency: 268 Hz (logic 1)
   - Space frequency: ~134 Hz carrier (logic 0)
   - Zero-crossing detector or correlator approach

3. **Symbol Recovery**
   - Clock sync at 134.4 baud
   - PLL (Phase-Locked Loop) or simple decimation
   - ~178 samples/bit @ 24kHz sample rate

4. **Frame Synchronization**
   - 23-bit sliding window
   - Detect repeating pattern
   - Handle bit slip/drift

5. **Golay (23,12) Decoder**
   - Correct up to 3 bit errors
   - Extract 12-bit data → 9 bits used (3 octal digits)
   - Detect inverted polarity

6. **Integration into radio_service.py**
   - Replace stub at line 1416-1419
   - Call DCSDecoder.decode() on sub-audio filtered chunk
   - Update `tone_match` based on detected code vs configured code

#### Estimated Effort:
- **BPF + FSK demod**: 2-3 hours
- **Symbol recovery + sync**: 3-4 hours
- **Golay decoder**: 4-5 hours
- **Integration + testing**: 2-3 hours
- **Total**: 11-15 hours

---

### Phase 5: Privacy Code UI (Not Started)

Add to **Radio Admin** page (`public/admin.html`):

#### Channel Privacy Settings Panel:
```html
<div class="form-group">
  <label>Privacy Code</label>
  <select id="privacyMode">
    <option value="none">None (Carrier Squelch Only)</option>
    <option value="ctcss">CTCSS (Tone)</option>
    <option value="dcs">DCS (Digital)</option>
  </select>
</div>

<!-- CTCSS Section -->
<div id="ctcssSettings" style="display:none">
  <label>CTCSS Tone</label>
  <select id="ctcssTone">
    <!-- Populated from /api/radio/privacy-codes -->
    <option value="67.0">1 - 67.0 Hz</option>
    <option value="131.8">20 - 131.8 Hz</option>
    ...
  </select>
  <div>Detected: <span id="ctcssDetected">--</span> Hz</div>
  <div>Signal: <span id="ctcssSignal">--</span> dB</div>
</div>

<!-- DCS Section -->
<div id="dcsSettings" style="display:none">
  <label>DCS Code</label>
  <select id="dcsCode">
    <option value="023">39 - D023N</option>
    <option value="023i">130 - D023I (Inverted)</option>
    ...
  </select>
  <div>Detected: <span id="dcsDetected">--</span></div>
</div>
```

#### Privacy Code Scanner:
```html
<button id="scanPrivacy">🔍 Scan for Privacy Codes</button>
<div id="scanResults">
  <!-- Shows detected CTCSS tones or DCS codes in real-time -->
</div>
```

---

### Phase 6: Auto-Detect Scanner (Not Started)

Implement privacy code scanner:
1. **CTCSS scanner**: Run Goertzel for all 38 frequencies simultaneously
2. **DCS scanner**: Run DCS decoder, report any valid codes detected
3. **UI updates**: Real-time display of detected codes
4. **One-click apply**: User clicks detected code to apply to channel

---

### Phase 7: Field Testing (Not Started)

With your CLP446e radios:
1. Test each CTCSS frequency (verify Goertzel accuracy)
2. Test DCS codes (once decoder implemented)
3. Tune detection thresholds
4. Measure false positive/negative rates
5. Test inverted DCS polarity
6. Verify multi-user scenarios (different codes on same channel)

---

## Testing Instructions

### Test CTCSS Now (Current Implementation):

1. **Set your CLP446e to CTCSS code 20 (131.8 Hz)**
   - Radio menu: Interference Eliminator Code → 20

2. **Configure radio service**:
   ```bash
   cd /var/www/stockroom-dashboard
   cat data/radio/config.json | jq '.channels[6].ctcss = 131.8' > /tmp/config.json
   mv /tmp/config.json data/radio/config.json
   ```

3. **Watch live privacy metering**:
   ```bash
   watch -n 0.5 'cat data/radio/live.json | jq .privacy'
   ```

4. **Transmit on your radio**:
   - Should see: `"mode": "ctcss"`, `"target": 131.8`, `"match": true`, `"ratio": > 0.08`

5. **Change CLP446e to different code**:
   - Should see: `"match": false` (squelch closed)

---

## API Documentation

### GET /api/radio/privacy-codes
Returns CTCSS/DCS code tables for CLP446e

**Response**:
```json
{
  "description": "CTCSS and DCS codes for Motorola CLP446e radio",
  "ctcss": [
    { "code": 1, "freq": 67.0, "label": "1 - 67.0 Hz" },
    { "code": 20, "freq": 131.8, "label": "20 - 131.8 Hz" },
    ...
  ],
  "dcs": [
    { "code": 39, "dcs": "023", "inverted": false, "label": "39 - D023N" },
    { "code": 130, "dcs": "023", "inverted": true, "label": "130 - D023I (inverted)" },
    ...
  ]
}
```

---

## Files Modified/Created

### Created:
- ✅ `radio/ctcss-dcs-codes.json` - Complete CLP446e code tables (205 codes)
- ✅ `radio/dcs_decoder.py` - DCS decoder stub with specifications

### Modified:
- ✅ `radio/radio_service.py` - Added TODO comments, improved CTCSS detection docs
- ✅ `routes/radio.js` - Added `/api/radio/privacy-codes` endpoint

### TODO:
- ⚠️ Complete `radio/dcs_decoder.py` implementation
- ⚠️ Add privacy code UI to `public/admin.html`
- ⚠️ Add privacy scanner to `public/radio-transcripts.html`
- ⚠️ Integrate DCS decoder into `radio/radio_service.py`

---

## Summary

**Working Now**:
- ✅ CTCSS detection (Goertzel, 38 tones, live metering)
- ✅ Privacy code tables (205 codes from CLP446e manual)
- ✅ API endpoint for code lookup
- ✅ Live privacy status output

**Needs Implementation**:
- ⚠️ DCS decoder (FSK demodulation, Golay decode)
- ⚠️ Privacy code UI (dropdown selectors, scanner)
- ⚠️ Auto-detect scanner
- ⚠️ Field testing and tuning

**Ready to Test**:
You can test CTCSS **right now** with your CLP446e by configuring a channel's `ctcss` field and watching the live privacy metering!
