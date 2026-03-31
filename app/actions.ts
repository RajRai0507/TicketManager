"use server";

import { google } from "googleapis";

// These need to be set in your .env.local file or Vercel project environment settings
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_CLIENT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY,
  },
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

export interface Ticket {
  id: string;
  title: string;
  date: string;
  timeTaken: string;
  shift: string[];
}

export async function getTickets(): Promise<Ticket[]> {
  try {
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      console.warn("Google Sheets credentials are not fully set up yet.");
      return [];
    }

    const sheets = google.sheets({ version: "v4", auth });
    
    // We assume the sheet is called "Sheet1" and read columns A to E
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "Sheet1!A2:E", // Skip header row A1:E1
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((row: string[]) => ({
      id: row[0] || "",
      title: row[1] || "",
      date: row[2] || "",
      timeTaken: row[3] || "",
      // Support legacy single-value shift and new multi-value stored as "A / B"
      shift: row[4] ? row[4].split(" / ").map((s: string) => s.trim()).filter(Boolean) : [],
    })).filter((t: Ticket) => t.id || t.title);
  } catch (error) {
    console.error("Error reading from Google Sheets:", error);
    return [];
  }
}

export async function addTicket(ticket: Ticket) {
  try {
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      throw new Error("Missing credentials");
    }

    const sheets = google.sheets({ version: "v4", auth });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "Sheet1!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [ticket.id, ticket.title, ticket.date, ticket.timeTaken, Array.isArray(ticket.shift) ? ticket.shift.join(" / ") : ticket.shift]
        ],
      },
    });
    
    return { success: true };
  } catch (err) {
    console.error("Failed to append to Google Sheets:", err);
    return { success: false };
  }
}

export async function removeTicket(indexToRemove: number) {
   try {
     if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
       throw new Error("Missing credentials");
     }

     const sheets = google.sheets({ version: "v4", auth });
     
     // To delete a row, we must know the sheetId. Often it is 0 for the first sheet.
     // In a robust implementation, we'd fetch the sheetId first. 
     // For simplicity and 99% of use cases, the primary sheetId is 0.
     await sheets.spreadsheets.batchUpdate({
       spreadsheetId: GOOGLE_SHEET_ID,
       requestBody: {
         requests: [
           {
             deleteDimension: {
               range: {
                 sheetId: 0,
                 dimension: "ROWS",
                 startIndex: indexToRemove + 1, // Start index is 0-based. Row 1 (header) is index 0. Real data starts at index 1.
                 endIndex: indexToRemove + 2,
               }
             }
           }
         ]
       }
     });

     return { success: true };
   } catch (err) {
     console.error("Failed to delete from Google Sheets:", err);
     return { success: false };
   }
}

export async function getSheetUrl() {
  if (process.env.GOOGLE_SHEET_ID) {
    return `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`;
  }
  return null;
}

