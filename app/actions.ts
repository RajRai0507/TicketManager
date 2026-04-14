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

// Convert hex color (#rrggbb) to Sheets API RGB object (values 0–1)
function hexToRgb(hex: string): { red: number; green: number; blue: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        red:   parseInt(result[1], 16) / 255,
        green: parseInt(result[2], 16) / 255,
        blue:  parseInt(result[3], 16) / 255,
      }
    : null;
}

export interface Ticket {
  id: string;
  title: string;
  date: string;
  timeTaken: string;
  shift: string[];
  textColor?: string;
}

export async function getTickets(): Promise<Ticket[]> {
  try {
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      console.warn("Google Sheets credentials are not fully set up yet.");
      return [];
    }

    const sheets = google.sheets({ version: "v4", auth });
    
    // We assume the sheet is called "Sheet1" and read columns A to F
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "Sheet1!A2:F", // Skip header row A1:F1
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
      textColor: row[5] || "",
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
    
    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "Sheet1!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [ticket.id, ticket.title, ticket.date, ticket.timeTaken, Array.isArray(ticket.shift) ? ticket.shift.join(" / ") : ticket.shift, ticket.textColor || ""]
        ],
      },
    });

    // Apply text color to the sheet row if a color was chosen
    if (ticket.textColor) {
      const rgb = hexToRgb(ticket.textColor);
      const updatedRange = appendResponse.data.updates?.updatedRange; // e.g. "Sheet1!A39:F39"
      if (rgb && updatedRange) {
        // Extract row number from range string, e.g. "Sheet1!A39:F39" → 39
        const rowMatch = updatedRange.match(/(\d+):(\d+)?[A-Z]?(\d+)?/);
        const rowNumber = rowMatch ? parseInt(rowMatch[1]) : null;
        if (rowNumber) {
          const rowIndex = rowNumber - 1; // Convert to 0-based index
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: GOOGLE_SHEET_ID,
            requestBody: {
              requests: [
                {
                  // Apply chosen color to data columns A–E
                  repeatCell: {
                    range: {
                      sheetId: 0,
                      startRowIndex: rowIndex,
                      endRowIndex: rowIndex + 1,
                      startColumnIndex: 0,
                      endColumnIndex: 5, // Columns A–E
                    },
                    cell: {
                      userEnteredFormat: {
                        textFormat: { foregroundColor: rgb },
                      },
                    },
                    fields: "userEnteredFormat.textFormat.foregroundColor",
                  },
                },
                {
                  // Hide the hex code in column F by making text white (invisible)
                  repeatCell: {
                    range: {
                      sheetId: 0,
                      startRowIndex: rowIndex,
                      endRowIndex: rowIndex + 1,
                      startColumnIndex: 5,
                      endColumnIndex: 6, // Column F only
                    },
                    cell: {
                      userEnteredFormat: {
                        textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } },
                      },
                    },
                    fields: "userEnteredFormat.textFormat.foregroundColor",
                  },
                },
              ],
            },
          });
        }
      }
    }

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

