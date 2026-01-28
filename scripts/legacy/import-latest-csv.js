const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

// Paste your CSV data here
const csvData = `Status,Count ID,Store Load,Location ID,Organization ID,Created Date,Overhead Read Included From,Counted By,Different Location Units,Expected Units,Counted Units,Missed Units that were in Available status,Missed Units that were in Reserved status,New Units,Found previously Missed Units,Undecodable Units,Unmapped Item Units,
COMPLETED,50712bac-af5d-4b2e-94cf-a7a589fbb1e5,true,SR-US-SanFrancisco-Maiden,SUIT-US,"February 17, 2025 at 9:34:05 AM PST","February 17, 2025 at 3:34:05 AM PST",VRocha@suitsupply.com,5,0,0,0,0,6652,0,32,4,
COMPLETED,c974ae5c-e50e-4383-984c-6abd6e6f516e,true,SR-US-SanFrancisco-Maiden,SUIT-US,"February 17, 2025 at 10:00:58 AM PST","February 17, 2025 at 4:00:58 AM PST",VRocha@suitsupply.com,4,6700,6656,32,12,76,0,48,5,
COMPLETED,c251a425-ff5a-4b79-b6b9-ee274c81f67d,true,SR-US-SanFrancisco-Maiden,SUIT-US,"February 19, 2025 at 8:26:56 AM PST","February 19, 2025 at 2:26:56 AM PST",VRocha@suitsupply.com,2,6713,6666,42,5,162,5,24,18,
COMPLETED,41ca833f-b0ae-48b3-bb8e-f8b9bdf7f74c,false,SR-US-SanFrancisco-Maiden,SUIT-US,"November 25, 2025 at 9:43:33 AM PST","November 25, 2025 at 3:43:33 AM PST",DIraheta@suitsupply.com,2,7732,7715,16,1,226,14,34,10,
COMPLETED,74141b18-999b-44eb-aa66-8934167f32c7,false,SR-US-SanFrancisco-Maiden,SUIT-US,"November 26, 2025 at 9:00:05 AM PST","November 26, 2025 at 3:00:05 AM PST",IRamos@suitsupply.com,2,7918,7893,25,0,205,8,27,10,
COMPLETED,d5061840-6040-40ba-897d-2c504cd81ff3,false,SR-US-SanFrancisco-Maiden,SUIT-US,"November 28, 2025 at 9:53:20 AM PST","November 28, 2025 at 3:53:20 AM PST",DIraheta@suitsupply.com,2,7864,7834,29,1,248,19,18,2,
COMPLETED,fdeb9e56-2836-4429-b15a-57530f47446b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"November 29, 2025 at 9:38:54 AM PST","November 29, 2025 at 3:38:54 AM PST",DValdez@suitsupply.com,2,7761,7716,45,0,255,14,55,1,
COMPLETED,413b7328-a974-4bf5-b5cc-dec3a68da19f,false,SR-US-SanFrancisco-Maiden,SUIT-US,"November 30, 2025 at 10:02:08 AM PST","November 30, 2025 at 4:02:08 AM PST",IRamos@suitsupply.com,1,7673,7664,9,0,229,42,104,2,
COMPLETED,499c8ec3-3789-4af2-a791-b11d27a763e8,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 1, 2025 at 10:18:49 AM PST","December 1, 2025 at 4:18:49 AM PST",DValdez@suitsupply.com,2,7575,7542,33,0,221,4,49,2,
COMPLETED,f7494d13-5a9b-4c36-87b9-35f1948da934,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 2, 2025 at 9:35:32 AM PST","December 2, 2025 at 3:35:32 AM PST",DIraheta@suitsupply.com,2,7743,7689,54,0,253,14,42,2,
COMPLETED,fd9f7c9d-48dc-4933-baf3-8e889ef5ab0e,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 3, 2025 at 8:44:08 AM PST","December 3, 2025 at 2:44:08 AM PST","VRocha@suitsupply.com,DIraheta@suitsupply.com",3,7595,7572,21,2,199,15,47,1,
COMPLETED,3edd3c4e-172c-4ffb-9655-02e83fbe7adf,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 4, 2025 at 10:56:33 AM PST","December 4, 2025 at 4:56:33 AM PST",IRamos@suitsupply.com,2,7657,7636,21,0,200,15,43,7,
COMPLETED,98664fa4-d59a-40da-9dfe-e81e074ecf5c,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 5, 2025 at 10:17:02 AM PST","December 5, 2025 at 4:17:02 AM PST",DValdez@suitsupply.com,3,7566,7534,32,0,189,4,47,1,
COMPLETED,6041b03a-8d9d-4e73-9fe5-8e13559a1f58,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 6, 2025 at 10:23:01 AM PST","December 6, 2025 at 4:23:01 AM PST",sanfrancisco@suitsupply.com,2,7391,7363,28,0,183,8,61,3,
COMPLETED,b10ec516-dba6-45f3-90d7-c79faaa63cf1,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 7, 2025 at 9:50:11 AM PST","December 7, 2025 at 3:50:11 AM PST",IRamos@suitsupply.com,1,7259,7252,7,0,177,37,71,5,
COMPLETED,d9d791fd-6e03-424d-bfe0-8faac777bf26,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 8, 2025 at 10:01:40 AM PST","December 8, 2025 at 4:01:40 AM PST",DIraheta@suitsupply.com,3,7184,7173,11,0,202,14,45,3,
COMPLETED,8b76e16b-f3c6-4631-aad9-7baaed0a68eb,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 9, 2025 at 9:50:29 AM PST","December 9, 2025 at 3:50:29 AM PST",DIraheta@suitsupply.com,4,7402,7388,14,0,173,18,24,5,
COMPLETED,b97278f1-c2f3-4924-b6ca-1bf10cf6145b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 10, 2025 at 10:54:24 AM PST","December 10, 2025 at 4:54:24 AM PST",sanfrancisco@suitsupply.com,2,7490,7460,30,0,204,6,83,13,
COMPLETED,cf8b65ff-f742-4695-b4e5-669c72b35695,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 11, 2025 at 10:44:52 AM PST","December 11, 2025 at 4:44:52 AM PST",DValdez@suitsupply.com,2,7660,7636,24,0,198,19,61,13,
COMPLETED,5ac95347-4d95-495e-8623-3ae0f10d01cc,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 12, 2025 at 10:05:01 AM PST","December 12, 2025 at 4:05:01 AM PST",DIraheta@suitsupply.com,2,7529,7501,28,0,220,28,34,2,
COMPLETED,f729f748-cd84-4aa6-b073-ed83014b1b14,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 13, 2025 at 10:22:50 AM PST","December 13, 2025 at 4:22:50 AM PST",DValdez@suitsupply.com,2,7422,7389,33,0,186,6,43,11,
COMPLETED,9c4e9dc9-05c2-458b-bdb5-541fcd182415,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 14, 2025 at 10:53:53 AM PST","December 14, 2025 at 4:53:53 AM PST",IRamos@suitsupply.com,1,7281,7268,13,0,214,49,103,6,
COMPLETED,989714ea-d3a8-4232-bc3d-1098450d75d7,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 15, 2025 at 11:11:19 AM PST","December 15, 2025 at 5:11:19 AM PST",DValdez@suitsupply.com,2,7228,7180,48,0,200,2,53,7,
COMPLETED,36d74b5e-f303-4141-93f1-fdd41c57b2cb,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 16, 2025 at 8:45:41 AM PST","December 16, 2025 at 2:45:41 AM PST",DIraheta@suitsupply.com,2,7115,7110,5,0,311,55,32,1,
COMPLETED,b818a3da-65f9-476a-9dda-867189d00949,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 17, 2025 at 10:28:44 AM PST","December 17, 2025 at 4:28:44 AM PST",VRocha@suitsupply.com,2,7528,7505,23,0,209,4,75,4,
COMPLETED,6c891c4a-7bea-40e3-a551-9d59cb19be71,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 18, 2025 at 10:42:32 AM PST","December 18, 2025 at 4:42:32 AM PST",VRocha@suitsupply.com,3,7963,7944,19,0,202,4,58,6,
COMPLETED,b600106e-ce39-42d7-8e2d-f5344aa990d8,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 19, 2025 at 9:46:49 AM PST","December 19, 2025 at 3:46:49 AM PST",IRamos@suitsupply.com,2,7920,7910,10,0,210,17,35,2,
COMPLETED,e67a7230-45e8-4342-9eea-7039cb7d6d65,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 20, 2025 at 10:24:05 AM PST","December 20, 2025 at 4:24:05 AM PST",DValdez@suitsupply.com,2,7834,7772,40,22,200,9,95,6,
COMPLETED,3da2aba5-eefc-42a9-920f-80271d753a2b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 21, 2025 at 9:59:54 AM PST","December 21, 2025 at 3:59:54 AM PST",IRamos@suitsupply.com,1,7716,7702,14,0,197,32,62,2,
COMPLETED,53c021e5-627a-4f31-8a41-92648778dbed,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 22, 2025 at 9:49:23 AM PST","December 22, 2025 at 3:49:23 AM PST",DIraheta@suitsupply.com,2,7690,7673,17,0,202,13,36,3,
COMPLETED,dadf72c4-a1cd-4355-8b52-837b11ddcfc8,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 23, 2025 at 9:02:36 AM PST","December 23, 2025 at 3:02:36 AM PST",DValdez@suitsupply.com,6,7627,7602,25,0,241,5,35,3,
CANCELLED,5de612f0-6888-490a-9f09-c36439a93b5b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 24, 2025 at 9:08:09 AM PST","December 24, 2025 at 3:08:09 AM PST",DIraheta@suitsupply.com,0,0,0,0,0,0,0,0,0,
CANCELLED,1baed445-33e3-4278-97d2-8df77802099f,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 24, 2025 at 12:44:41 PM PST","December 24, 2025 at 6:44:41 AM PST",DIraheta@suitsupply.com,0,0,0,0,0,0,0,0,0,
CANCELLED,fe3219de-9f2e-4316-a1cc-52cbd2685318,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 24, 2025 at 12:44:41 PM PST","December 24, 2025 at 6:44:41 AM PST",DIraheta@suitsupply.com,0,0,0,0,0,0,0,0,0,
COMPLETED,64ce59d1-0228-4283-aea2-3b1466e0270d,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 24, 2025 at 12:44:41 PM PST","December 24, 2025 at 6:44:41 AM PST",DIraheta@suitsupply.com,2,7601,7582,13,6,180,30,22,1,
COMPLETED,3ab8bd7f-5bc9-47be-a2a3-c54138470710,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 26, 2025 at 9:10:06 AM PST","December 26, 2025 at 3:10:06 AM PST",DIraheta@suitsupply.com,1,7591,7582,9,0,211,12,31,2,
COMPLETED,6de1ecde-446f-4fd1-bb6f-51e5c4f2894b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 27, 2025 at 10:30:57 AM PST","December 27, 2025 at 4:30:57 AM PST",DValdez@suitsupply.com,2,7919,7874,45,0,178,5,50,4,
COMPLETED,69ea5191-6c5b-4b36-9ac3-2225a2ebbae3,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 28, 2025 at 9:58:12 AM PST","December 28, 2025 at 3:58:12 AM PST",IRamos@suitsupply.com,2,7798,7783,15,0,201,38,25,2,
COMPLETED,66ae70af-20c9-44f1-b2dd-349066e0cf60,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 29, 2025 at 10:00:41 AM PST","December 29, 2025 at 4:00:41 AM PST",DIraheta@suitsupply.com,1,7745,7734,10,1,174,15,35,3,
COMPLETED,ad9809f5-3d43-453e-b987-f5b644835d21,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 30, 2025 at 10:56:06 AM PST","December 30, 2025 at 4:56:06 AM PST",DValdez@suitsupply.com,2,7768,7734,34,0,178,10,59,4,
COMPLETED,21af74f8-5c19-463f-b471-1c8df5909ca2,false,SR-US-SanFrancisco-Maiden,SUIT-US,"December 31, 2025 at 8:57:40 AM PST","December 31, 2025 at 2:57:40 AM PST",DIraheta@suitsupply.com,1,7816,7793,23,0,174,30,34,4,
COMPLETED,4ea20370-a265-4e5f-9c61-edad431e4d04,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 2, 2026 at 10:13:27 AM PST","January 2, 2026 at 4:13:27 AM PST",DIraheta@suitsupply.com,2,8007,7996,11,0,156,13,27,4,
COMPLETED,a5795db1-3366-4895-8826-33a6db8c78ee,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 3, 2026 at 10:53:10 AM PST","January 3, 2026 at 4:53:10 AM PST",IRamos@suitsupply.com,2,8016,7994,22,0,175,16,62,5,
COMPLETED,1df128b0-933a-4043-a2a2-202acf9ec0d3,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 4, 2026 at 9:49:26 AM PST","January 4, 2026 at 3:49:26 AM PST",IRamos@suitsupply.com,3,7894,7880,14,0,181,8,71,5,
COMPLETED,91bebf29-304c-40f9-8471-39e184e2939b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 5, 2026 at 10:19:36 AM PST","January 5, 2026 at 4:19:36 AM PST",DIraheta@suitsupply.com,2,7805,7787,18,0,166,22,65,3,
COMPLETED,acbb99f7-29ea-40f6-a8b5-b280eb11743f,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 6, 2026 at 8:14:20 AM PST","January 6, 2026 at 2:14:20 AM PST",VRocha@suitsupply.com,1,7730,7709,21,0,188,8,40,1,
COMPLETED,a6f2064d-19e9-44b4-83fe-05cf3b51361a,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 7, 2026 at 9:01:43 AM PST","January 7, 2026 at 3:01:43 AM PST",DIraheta@suitsupply.com,4,7706,7695,11,0,175,24,57,1,
COMPLETED,8a8ecd07-2e86-4fd6-8d8b-a083bd7fae69,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 8, 2026 at 9:49:52 AM PST","January 8, 2026 at 3:49:52 AM PST",DValdez@suitsupply.com,1,8108,8062,46,0,168,6,22,1,
CANCELLED,569cf253-6d04-43fc-9908-6cd9c96a5784,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 8, 2026 at 6:00:02 PM PST","January 8, 2026 at 12:00:02 PM PST",DValdez@suitsupply.com,0,0,0,0,0,0,0,0,0,
COMPLETED,765e0c4a-694a-4de5-8827-df2ccb7e7d17,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 9, 2026 at 10:06:11 AM PST","January 9, 2026 at 4:06:11 AM PST",DIraheta@suitsupply.com,2,7995,7984,11,0,192,30,31,5,
COMPLETED,2473d93e-9c38-4834-b9d2-254f96ff2905,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 10, 2026 at 10:22:10 AM PST","January 10, 2026 at 4:22:10 AM PST",DValdez@suitsupply.com,2,7932,7878,54,0,176,10,47,2,
COMPLETED,d6b22145-701c-4672-9d73-c99b7d5e7e1e,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 11, 2026 at 9:31:46 AM PST","January 11, 2026 at 3:31:46 AM PST",IRamos@suitsupply.com,1,7766,7754,11,1,167,36,50,3,
COMPLETED,90d5a485-3cc6-4e6b-9033-1be889305e0a,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 12, 2026 at 9:56:19 AM PST","January 12, 2026 at 3:56:19 AM PST",DIraheta@suitsupply.com,2,7626,7611,15,0,193,26,28,3,
COMPLETED,d527385a-f750-4e29-ab78-da616dbd2b84,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 13, 2026 at 9:24:00 AM PST","January 13, 2026 at 3:24:00 AM PST",DIraheta@suitsupply.com,1,7622,7606,16,0,159,8,21,2,
COMPLETED,2ce73010-4687-4cb6-9afc-79b8d85f7538,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 14, 2026 at 10:13:12 AM PST","January 14, 2026 at 4:13:12 AM PST",DIraheta@suitsupply.com,2,7658,7649,7,2,175,9,40,3,
COMPLETED,f28c421e-5a4a-4741-8c20-8aefa5dcfcf3,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 15, 2026 at 10:31:24 AM PST","January 15, 2026 at 4:31:24 AM PST",sanfrancisco@suitsupply.com,2,7805,7768,37,0,160,7,77,10,
COMPLETED,abacf6ad-0a44-4905-88a2-f3ed29f10360,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 16, 2026 at 10:16:46 AM PST","January 16, 2026 at 4:16:46 AM PST",DIraheta@suitsupply.com,2,7697,7668,29,0,179,28,23,3,
COMPLETED,6213a4d4-82c2-4a71-984e-f7b7ccadb648,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 17, 2026 at 10:49:49 AM PST","January 17, 2026 at 4:49:49 AM PST",JUyeki@suitsupply.com,2,7542,7510,32,0,238,31,137,8,
COMPLETED,9949a17f-cda2-4767-8a31-dbde5eaec6c5,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 18, 2026 at 9:57:40 AM PST","January 18, 2026 at 3:57:40 AM PST",IRamos@suitsupply.com,2,7396,7385,11,0,210,23,52,3,
COMPLETED,5365c761-ce01-4c7b-b9e7-a45809041ad3,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 19, 2026 at 10:07:59 AM PST","January 19, 2026 at 4:07:59 AM PST",DIraheta@suitsupply.com,2,7321,7313,8,0,152,12,36,1,
COMPLETED,55c0a93e-748c-4c19-9b0a-fab313dec328,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 20, 2026 at 8:28:11 AM PST","January 20, 2026 at 2:28:11 AM PST",DIraheta@suitsupply.com,1,7292,7273,19,0,196,8,19,1,
COMPLETED,3ab75f65-0c5f-4cbc-8852-a45279b48819,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 21, 2026 at 9:11:40 AM PST","January 21, 2026 at 3:11:40 AM PST",DIraheta@suitsupply.com,1,7626,7617,9,0,207,19,17,4,
COMPLETED,bc875502-ea49-47e6-824d-9a871fc54c16,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 22, 2026 at 10:26:07 AM PST","January 22, 2026 at 4:26:07 AM PST",VRocha@suitsupply.com,2,7975,7928,47,0,338,3,102,4,
COMPLETED,06618efb-5003-4721-a80a-0370808b3c5b,false,SR-US-SanFrancisco-Maiden,SUIT-US,"January 23, 2026 at 10:16:16 AM PST","January 23, 2026 at 4:16:16 AM PST",DIraheta@suitsupply.com,2,7894,7787,101,6,140,12,22,4,`;

function parseCSVDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const cleaned = dateStr.replace(/^["']|["']$/g, '').trim();
  
  const monthNames = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04', 'May': '05', 'June': '06',
    'July': '07', 'August': '08', 'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };
  const longDate = cleaned.match(/^([A-Za-z]+) (\d{1,2}), (\d{4}) at/);
  if (longDate) {
    const [_, monthName, day, year] = longDate;
    const month = monthNames[monthName];
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }
  }
  
  return null;
}

async function importCSV() {
  console.log('Processing CSV data...');
  
  const lines = csvData.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  console.log(`Total lines: ${lines.length}`);
  
  // Get list of valid employee emails from users table
  const validUsersResult = await pool.query(
    `SELECT LOWER(email) as email FROM users WHERE is_active = true`
  );
  const validEmails = new Set(validUsersResult.rows.map(r => r.email));
  console.log(`Found ${validEmails.size} valid employee emails in database`);
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let skippedReasons = { noEmployee: 0, multiPerson: 0, generic: 0, cancelled: 0, other: 0 };
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV properly handling quoted values
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    
    if (values.length < 10) continue;
    
    const status = values[0].replace(/^["']|["']$/g, '').trim();
    const countId = values[1].replace(/^["']|["']$/g, '').trim();
    const createdDate = values[5];
    const countedBy = values[7] ? values[7].replace(/^["']|["']$/g, '').trim() : '';
    
    // Skip CANCELLED scans
    if (status === 'CANCELLED') {
      skipped++;
      skippedReasons.cancelled++;
      continue;
    }
    
    const scanDate = parseCSVDate(createdDate);
    if (!scanDate) {
      console.log(`Skipping row ${i}: cannot parse date "${createdDate}"`);
      skipped++;
      skippedReasons.other++;
      continue;
    }
    
    // Skip if counted_by has multiple emails (comma-separated)
    if (countedBy.includes(',')) {
      console.log(`Skipping row ${i}: multi-person scan (${countedBy})`);
      skipped++;
      skippedReasons.multiPerson++;
      continue;
    }
    
    // Skip generic store emails
    const lowerCountedBy = countedBy.toLowerCase();
    if (lowerCountedBy === 'sanfrancisco@suitsupply.com' || 
        lowerCountedBy.includes('store@') ||
        lowerCountedBy === 'store' ||
        /^j\d+$/i.test(countedBy) ||
        lowerCountedBy === 'juyeki@suitsupply.com') {  // Skip Jay/JUyeki
      console.log(`Skipping row ${i}: generic/non-employee email (${countedBy})`);
      skipped++;
      skippedReasons.generic++;
      continue;
    }
    
    // Only import if the counted_by email exists in users table
    if (countedBy && !validEmails.has(lowerCountedBy)) {
      console.log(`Skipping row ${i}: employee not in database (${countedBy})`);
      skipped++;
      skippedReasons.noEmployee++;
      continue;
    }
    
    const expectedUnits = parseInt(values[9]) || 0;
    const countedUnits = parseInt(values[10]) || 0;
    const missedAvailable = parseInt(values[11]) || 0;
    const missedReserved = parseInt(values[12]) || 0;
    const newUnits = parseInt(values[13]) || 0;
    const foundPreviouslyMissed = parseInt(values[14]) || 0;
    const undecodableUnits = parseInt(values[15]) || 0;
    const unmappedItemUnits = parseInt(values[16]) || 0;
    
    try {
      const result = await pool.query(
        `INSERT INTO daily_scan_results 
         (count_id, status, scan_date, counted_by, expected_units, counted_units,
          missed_units_available, missed_units_reserved, new_units, 
          found_previously_missed_units, undecodable_units, unmapped_item_units)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (count_id) DO UPDATE SET
          status = EXCLUDED.status,
          scan_date = EXCLUDED.scan_date,
          counted_by = EXCLUDED.counted_by,
          expected_units = EXCLUDED.expected_units,
          counted_units = EXCLUDED.counted_units,
          missed_units_available = EXCLUDED.missed_units_available,
          missed_units_reserved = EXCLUDED.missed_units_reserved,
          new_units = EXCLUDED.new_units,
          found_previously_missed_units = EXCLUDED.found_previously_missed_units,
          undecodable_units = EXCLUDED.undecodable_units,
          unmapped_item_units = EXCLUDED.unmapped_item_units,
          updated_at = CURRENT_TIMESTAMP`,
        [countId, status, scanDate, countedBy, expectedUnits, countedUnits,
         missedAvailable, missedReserved, newUnits, foundPreviouslyMissed,
         undecodableUnits, unmappedItemUnits]
      );
      
      if (result.rowCount > 0) {
        imported++;
        if (scanDate >= '2026-01-17') {
          updated++;
          console.log(`✅ Updated ${scanDate} - ${countedBy}: ${countedUnits}/${expectedUnits}`);
        }
      }
      
      if (imported % 10 === 0) {
        console.log(`Processed ${imported} records...`);
      }
    } catch (error) {
      console.error(`Error importing row ${i}:`, error.message);
      skipped++;
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`Imported/Updated: ${imported}`);
  console.log(`  - Recent dates updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`  - CANCELLED scans: ${skippedReasons.cancelled}`);
  console.log(`  - Not in database: ${skippedReasons.noEmployee}`);
  console.log(`  - Multi-person scans: ${skippedReasons.multiPerson}`);
  console.log(`  - Generic/non-employee emails: ${skippedReasons.generic}`);
  console.log(`  - Other reasons: ${skippedReasons.other}`);
  
  const result = await pool.query('SELECT COUNT(*), MIN(scan_date), MAX(scan_date) FROM daily_scan_results WHERE status = \'COMPLETED\'');
  console.log(`\nTotal COMPLETED records in DB: ${result.rows[0].count}`);
  console.log(`Date range: ${result.rows[0].min} to ${result.rows[0].max}`);
  
  // Show the updated recent dates
  console.log('\nRecent dates (Jan 17-23):');
  const recentResult = await pool.query(`
    SELECT scan_date, counted_by, expected_units, counted_units, status 
    FROM daily_scan_results 
    WHERE scan_date >= '2026-01-17' 
    ORDER BY scan_date DESC, id
  `);
  recentResult.rows.forEach(r => {
    console.log(`  ${r.scan_date} - ${r.counted_by}: ${r.counted_units}/${r.expected_units} (${r.status})`);
  });
  
  await pool.end();
}

importCSV().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
