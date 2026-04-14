"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Calendar,
  Hash,
  Type,
  Clock,
  CheckCircle2,
  RefreshCw,
  Database,
  ExternalLink,
  Lock,
  Unlock,
  ChevronDown,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import {
  getTickets,
  addTicket,
  removeTicket,
  Ticket,
  getSheetUrl,
} from "./actions";

export default function HiveTicketTracker() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [newTicket, setNewTicket] = useState<{
    id: string;
    title: string;
    date: string;
    timeTaken: string;
    shift: string[];
    textColor: string;
  }>({
    id: "",
    title: "",
    date: "",
    timeTaken: "",
    shift: ["First Half"],
    textColor: "",
  });
  const [timeValue, setTimeValue] = useState("");
  const [timeUnit, setTimeUnit] = useState("Hours");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true); // Flag to check if .env is set
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [isAuthEnabled, setIsAuthEnabled] = useState(true); // Default to true on new devices

  // Custom Select State
  const [isTimeUnitOpen, setIsTimeUnitOpen] = useState(false);
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const timeUnitRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        timeUnitRef.current &&
        !timeUnitRef.current.contains(event.target as Node)
      ) {
        setIsTimeUnitOpen(false);
      }
      if (
        shiftRef.current &&
        !shiftRef.current.contains(event.target as Node)
      ) {
        setIsShiftOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [pinModal, setPinModal] = useState<{
    isOpen: boolean;
    message: string;
    resolve: (pin: string | null) => void;
  }>({
    isOpen: false,
    message: "",
    resolve: () => {},
  });
  const [pinInput, setPinInput] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Edit modal state
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    index: number | null;
    ticket: Ticket | null;
  }>({
    isOpen: false,
    index: null,
    ticket: null,
  });

  const requestPin = (message: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setPinModal({ isOpen: true, message, resolve });
    });
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    pinModal.resolve(pinInput);
    setPinModal({ ...pinModal, isOpen: false });
    setPinInput("");
  };

  const handlePinCancel = () => {
    pinModal.resolve(null);
    setPinModal({ ...pinModal, isOpen: false });
    setPinInput("");
  };

  const STATIC_PIN = process.env.NEXT_PUBLIC_APP_PIN;

  // Load from Google Sheets on mount
  useEffect(() => {
    async function loadData() {
      try {
        const data = await getTickets();
        setTickets(data);

        const url = await getSheetUrl();
        setSheetUrl(url);
        toast.success("Tickets fetched successfully!");
      } catch (err) {
        toast.error("Failed to fetch tickets!");
        // If credentials are missing, it will return empty safely but we can flag it
        console.warn(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    // Set date only on client to avoid Server/Client hydration mismatch
    setNewTicket((prev) => ({
      ...prev,
      date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .split("T")[0],
    }));
    const savedAuth = localStorage.getItem("isAuthEnabled");
    if (savedAuth === "false") {
      setIsAuthEnabled(false);
    } else {
      // If null (first time) or true, default to locked
      setIsAuthEnabled(true);
    }
  }, []);

  const handleToggleAuth = async () => {
    const pin = await requestPin(
      `Enter 4-digit PIN to ${isAuthEnabled ? "disable" : "enable"} authentication:`,
    );
    if (pin === STATIC_PIN) {
      const newState = !isAuthEnabled;
      setIsAuthEnabled(newState);
      localStorage.setItem("isAuthEnabled", newState.toString());
      toast.success(`Authentication ${newState ? "enabled" : "disabled"}`);
    } else if (pin !== null) {
      toast.error("Incorrect PIN!");
    }
  };

  const handleAddTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.id.trim() || !newTicket.title.trim() || !newTicket.date)
      return;

    if (isAuthEnabled) {
      const pin = await requestPin(
        "Authentication required. Enter 4-digit PIN:",
      );
      if (pin !== STATIC_PIN) {
        if (pin !== null) toast.error("Incorrect PIN! Ticket not added.");
        return;
      }
    }

    let finalId = newTicket.id.trim();
    if (!finalId.toLowerCase().startsWith("id")) {
      finalId = `Id ${finalId}`;
    }
    const formattedTicket = { ...newTicket, id: finalId };

    // Optimistically update UI (but wait for server to confirm order)
    setIsSaving(true);
    const toastId = toast.loading("Saving ticket to cloud...");
    const result = await addTicket(formattedTicket);

    if (result.success) {
      // Re-fetch to ensure sync with Google Sheets (since appending goes to the bottom)
      const data = await getTickets();
      setTickets(data);
      setNewTicket({
        id: "",
        title: "",
        date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
          .toISOString()
          .split("T")[0],
        timeTaken: "",
        shift: ["First Half"],
        textColor: "",
      });
      setTimeValue("");
      toast.success("Ticket added successfully!", { id: toastId });
    } else {
      toast.error("Failed to save to Google Sheets! Check .env credentials.", {
        id: toastId,
      });
      setIsConfigured(false);
    }

    setIsSaving(false);
  };

  const handleRemoveTicket = async (indexToRemove: number) => {
    if (isAuthEnabled) {
      const ticketId = tickets[indexToRemove].id;
      const pin = await requestPin(
        `Authentication required. Enter 4-digit PIN to delete Ticket [${ticketId}]:`,
      );
      if (pin !== STATIC_PIN) {
        if (pin !== null) toast.error("Incorrect PIN! Ticket not deleted.");
        return;
      }
    }

    setIsSaving(true);
    const toastId = toast.loading("Deleting ticket...");

    const result = await removeTicket(indexToRemove);
    if (result.success) {
      const data = await getTickets();
      setTickets(data);
      toast.success("Ticket deleted successfully!", { id: toastId });
    } else {
      toast.error("Failed to delete from Google Sheets!", { id: toastId });
    }

    setIsSaving(false);
  };

  const handleEditTicket = (index: number) => {
    setEditModal({
      isOpen: true,
      index: index,
      ticket: { ...tickets[index] },
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.ticket || editModal.index === null) return;

    if (isAuthEnabled) {
      const pin = await requestPin(
        `Authentication required. Enter 4-digit PIN to edit Ticket [${editModal.ticket.id}]:`,
      );
      if (pin !== STATIC_PIN) {
        if (pin !== null) toast.error("Incorrect PIN! Ticket not edited.");
        return;
      }
    }

    setIsSaving(true);

    // Update the ticket in memory
    const updatedTickets = [...tickets];
    updatedTickets[editModal.index] = editModal.ticket;
    setTickets(updatedTickets);

    setEditModal({ isOpen: false, index: null, ticket: null });
    toast.success("Ticket updated successfully!");

    setIsSaving(false);
  };

  const handleEditCancel = () => {
    setEditModal({ isOpen: false, index: null, ticket: null });
  };

  // Calculate pagination
  const totalPages = Math.ceil(tickets.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedTickets = tickets.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 md:p-12">
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-neutral-950 animate-in fade-in duration-500">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500 rounded-full blur-3xl opacity-20 animate-pulse" />
            <div className="relative p-8 bg-neutral-900 border border-neutral-800 rounded-full shadow-2xl">
              <Database className="w-16 h-16 text-emerald-500 animate-pulse" />
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-4">
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">
              Ticket Manager
            </h1>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
              <span className="text-neutral-500 text-sm font-medium tracking-tight">
                Authenticating Cloud Sync...
              </span>
            </div>
            {/* Progress line */}
            <div className="w-48 h-1 bg-neutral-900 rounded-full overflow-hidden mt-4">
              <div className="h-full bg-emerald-500 w-1/3 rounded-full animate-[progress_1.5s_infinite_ease-in-out]" />
            </div>
          </div>

          <style jsx>{`
            @keyframes progress {
              0% {
                transform: translateX(-100%);
                width: 30%;
              }
              50% {
                width: 60%;
              }
              100% {
                transform: translateX(330%);
                width: 30%;
              }
            }
          `}</style>
        </div>
      )}

      {pinModal.isOpen && (
        <div className="fixed inset-0 z-51 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
              <Lock className="w-5 h-5 text-emerald-400" />
              Security Check
            </h3>
            <p className="text-neutral-400 text-sm mb-8">{pinModal.message}</p>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                required
                autoFocus
                maxLength={4}
                value={pinInput}
                onChange={(e) =>
                  setPinInput(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="••••"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-4 text-center text-3xl tracking-[1em] indent-[1em] text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-mono"
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePinCancel}
                  className="w-1/2 py-3 px-4 rounded-xl font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 px-4 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModal.isOpen && editModal.ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Edit2 className="w-5 h-5 text-emerald-400" />
              Edit Ticket
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-neutral-500" /> Ticket ID
                </label>
                <input
                  type="text"
                  value={editModal.ticket.id}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      ticket: {
                        ...editModal.ticket,
                        id: e.target.value,
                      } as Ticket,
                    })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-neutral-500" /> Task Title
                </label>
                <input
                  type="text"
                  value={editModal.ticket.title}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      ticket: {
                        ...editModal.ticket,
                        title: e.target.value,
                      } as Ticket,
                    })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-neutral-500" /> Date
                </label>
                <input
                  type="date"
                  value={editModal.ticket.date}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      ticket: {
                        ...editModal.ticket,
                        date: e.target.value,
                      } as Ticket,
                    })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-neutral-500" /> Time Taken
                </label>
                <input
                  type="text"
                  value={editModal.ticket.timeTaken}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      ticket: {
                        ...editModal.ticket,
                        timeTaken: e.target.value,
                      } as Ticket,
                    })
                  }
                  placeholder="e.g. 2 Hours"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-neutral-500" /> Shift
                  Period
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "First Half",
                    "Second Half",
                    "Night Shift",
                    "Off Shift",
                  ].map((shift) => {
                    const isSelected =
                      editModal.ticket && Array.isArray(editModal.ticket.shift)
                        ? editModal.ticket.shift.includes(shift)
                        : false;
                    return (
                      <button
                        key={shift}
                        type="button"
                        onClick={() => {
                          if (!editModal.ticket) return;
                          const currentShift = editModal.ticket.shift || [];
                          const updated = isSelected
                            ? Array.isArray(currentShift)
                              ? currentShift.filter((s: string) => s !== shift)
                              : []
                            : Array.isArray(currentShift)
                              ? [...currentShift, shift]
                              : [shift];
                          setEditModal({
                            ...editModal,
                            ticket: {
                              ...editModal.ticket,
                              shift: updated,
                            } as Ticket,
                          });
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          isSelected
                            ? "bg-emerald-600 text-white"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                      >
                        {shift}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Color Picker – Edit Modal */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-neutral-500" /> Row Text
                  Color
                  <span className="ml-auto text-[10px] text-neutral-500 font-normal">
                    (optional)
                  </span>
                </label>
                <div className="flex gap-3 items-center">
                  {(
                    [
                      { color: "", label: "Default" },
                      { color: "#ef4444", label: "Red" },
                      { color: "#22c55e", label: "Green" },
                      { color: "#86efac", label: "Green 2" },
                      { color: "#3b82f6", label: "Blue" },
                    ] as { color: string; label: string }[]
                  ).map(({ color, label }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          editModal.ticket &&
                          setEditModal({
                            ...editModal,
                            ticket: {
                              ...editModal.ticket,
                              textColor: color,
                            } as Ticket,
                          })
                        }
                        title={label}
                        className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer shrink-0 ${
                          (editModal.ticket?.textColor ?? "") === color
                            ? "border-emerald-400 scale-110 shadow-lg shadow-emerald-500/30"
                            : "border-neutral-600 hover:border-neutral-400"
                        } ${!color ? "bg-neutral-800 flex items-center justify-center" : ""}`}
                        style={color ? { backgroundColor: color } : {}}
                      >
                        {!color && (
                          <span className="text-neutral-400 text-[10px] font-bold leading-none">
                            —
                          </span>
                        )}
                      </button>
                      <span className="text-[9px] text-neutral-500 font-medium">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleEditCancel}
                  className="w-1/2 py-3 px-4 rounded-xl font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-1/2 py-3 px-4 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20">
                <Database className="w-8 h-8 text-white" />
              </div>
              Hey, it’s Ticket Manager Desk
            </h1>
            <p className="text-neutral-400 mt-2 text-lg">
              Synchronizing continuously with your Cloud Database ☁️
            </p>
          </div>

          <div className="flex gap-3 items-center">
            {isSaving && (
              <span className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Syncing...
              </span>
            )}

            {sheetUrl && (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View Sheet
              </a>
            )}

            <button
              onClick={handleToggleAuth}
              className={`px-4 py-2.5 flex items-center gap-2 rounded-xl font-medium text-sm transition-all border cursor-pointer ${
                isAuthEnabled
                  ? "bg-emerald-900/30 text-emerald-400 border-emerald-800/50 hover:bg-emerald-800/40"
                  : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700"
              }`}
              title="Toggle Security PIN"
            >
              {isAuthEnabled ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              {isAuthEnabled ? "App Locked" : "App Unlocked"}
            </button>

            <div className="px-4 py-2.5 rounded-xl font-medium bg-neutral-800 text-white flex items-center gap-2 border border-neutral-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Live Sync
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Form */}
          <div className="lg:col-span-1 border border-neutral-800 bg-neutral-900/50 rounded-3xl p-6 shadow-xl backdrop-blur-sm h-fit sticky top-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Log New Ticket
            </h2>

            <form onSubmit={handleAddTicket} className="space-y-5">
              <div className="space-y-4">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-neutral-500" /> Ticket ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HIVE-1234"
                  value={newTicket.id}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, id: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-neutral-500" /> Task Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement authentication"
                  value={newTicket.title}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, title: e.target.value })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-neutral-500" /> Date
                </label>
                <input
                  type="date"
                  required
                  value={newTicket.date}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, date: e.target.value })
                  }
                  className="block w-full min-w-0 appearance-none bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all scheme-dark"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-neutral-500" /> Time Taken
                </label>
                <div className="flex -space-x-px">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="e.g. 2"
                      value={timeValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTimeValue(val);
                        setNewTicket({
                          ...newTicket,
                          timeTaken: val ? `${val} ${timeUnit}` : "",
                        });
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-l-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:z-10 transition-all"
                    />
                  </div>
                  <div className="relative w-28 md:w-32" ref={timeUnitRef}>
                    <button
                      type="button"
                      onClick={() => setIsTimeUnitOpen(!isTimeUnitOpen)}
                      className="w-full h-full flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-r-xl px-3 md:px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:z-10 transition-all cursor-pointer text-left"
                    >
                      <span className="text-sm">{timeUnit}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${isTimeUnitOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isTimeUnitOpen && (
                      <div className="absolute top-full left-0 w-full mt-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl z-20 backdrop-blur-xl animate-in fade-in zoom-in duration-200">
                        {["Hours", "Mins"].map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => {
                              setTimeUnit(unit);
                              setNewTicket({
                                ...newTicket,
                                timeTaken: timeValue
                                  ? `${timeValue} ${unit}`
                                  : "",
                              });
                              setIsTimeUnitOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 text-sm text-left hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors ${timeUnit === unit ? "text-emerald-400 bg-emerald-500/5" : "text-neutral-400"}`}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-neutral-500" /> Shift
                  Period
                  <span className="ml-auto text-[10px] text-neutral-500 font-normal">
                    (select multiple)
                  </span>
                </label>
                <div className="relative" ref={shiftRef}>
                  <button
                    type="button"
                    onClick={() => setIsShiftOpen(!isShiftOpen)}
                    className="w-full flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer text-left"
                  >
                    <span className="text-sm truncate pr-2">
                      {newTicket.shift.length === 0 ? (
                        <span className="text-neutral-600">
                          Select shifts...
                        </span>
                      ) : (
                        newTicket.shift.join(" + ")
                      )}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform duration-200 ${isShiftOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isShiftOpen && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl z-20 backdrop-blur-xl animate-in fade-in zoom-in duration-200">
                      {[
                        "First Half",
                        "Second Half",
                        "Night Shift",
                        "Off Shift",
                      ].map((shift) => {
                        const isSelected = newTicket.shift.includes(shift);
                        return (
                          <button
                            key={shift}
                            type="button"
                            onClick={() => {
                              const updated = isSelected
                                ? newTicket.shift.filter((s) => s !== shift)
                                : [...newTicket.shift, shift];
                              setNewTicket({ ...newTicket, shift: updated });
                            }}
                            className={`w-full px-4 py-3 text-sm text-left flex items-center gap-3 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors ${
                              isSelected
                                ? "text-emerald-400 bg-emerald-500/5"
                                : "text-neutral-400"
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border transition-colors ${
                                isSelected
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-neutral-600"
                              }`}
                            >
                              {isSelected && (
                                <svg
                                  className="w-2.5 h-2.5 text-white"
                                  viewBox="0 0 10 8"
                                  fill="none"
                                >
                                  <path
                                    d="M1 4l3 3 5-6"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </span>
                            {shift}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Text Color Picker */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-neutral-500" /> Row Text
                  Color
                  <span className="ml-auto text-[10px] text-neutral-500 font-normal">
                    (optional)
                  </span>
                </label>
                <div className="flex gap-3 items-center">
                  {(
                    [
                      { color: "", label: "Default" },
                      { color: "#ef4444", label: "Red" },
                      { color: "#22c55e", label: "Green" },
                      { color: "#86efac", label: "Green 2" },
                      { color: "#3b82f6", label: "Blue" },
                    ] as { color: string; label: string }[]
                  ).map(({ color, label }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setNewTicket({ ...newTicket, textColor: color })
                        }
                        title={label}
                        className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer shrink-0 ${
                          newTicket.textColor === color
                            ? "border-emerald-400 scale-110 shadow-lg shadow-emerald-500/30"
                            : "border-neutral-600 hover:border-neutral-400"
                        } ${!color ? "bg-neutral-800 flex items-center justify-center" : ""}`}
                        style={color ? { backgroundColor: color } : {}}
                      >
                        {!color && (
                          <span className="text-neutral-400 text-[10px] font-bold leading-none">
                            —
                          </span>
                        )}
                      </button>
                      <span className="text-[9px] text-neutral-500 font-medium">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  isSaving ||
                  !newTicket.id.trim() ||
                  !newTicket.title.trim() ||
                  !newTicket.date
                }
                className="w-full mt-4 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3 px-4 flex items-center justify-center gap-2 rounded-xl transition-all cursor-pointer"
              >
                {isSaving ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                {isSaving ? "Syncing..." : "Add & Sync to Cloud"}
              </button>
            </form>
          </div>

          {/* Right Column: List */}
          <div className="lg:col-span-2 border border-neutral-800 bg-neutral-900/50 rounded-3xl shadow-xl backdrop-blur-sm min-h-[500px] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Live Data Feed
              </h2>
              <span className="bg-neutral-800 text-neutral-300 text-xs py-1 px-3 rounded-full font-medium">
                {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
              </span>
            </div>

            {isLoading ? null : !isConfigured ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 m-6 border-2 border-dashed border-red-900/50 rounded-2xl bg-red-900/10">
                <Database className="w-16 h-16 text-red-500 mb-4" />
                <h3 className="text-lg font-bold text-red-400">
                  Setup Required
                </h3>
                <p className="text-neutral-400 mt-2 max-w-sm">
                  Please link your Google Service Account in your{" "}
                  <code className="bg-black px-1 py-0.5 rounded text-red-300">
                    .env.local
                  </code>{" "}
                  file to begin syncing data.
                </p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 m-6 border-2 border-dashed border-neutral-800 rounded-2xl bg-neutral-900/30">
                <Database className="w-16 h-16 text-neutral-700 mb-4" />
                <h3 className="text-lg font-bold text-neutral-300">
                  Your Cloud Sheet is Empty
                </h3>
                <p className="text-neutral-500 mt-2 max-w-sm">
                  Add a ticket using the form on the left. It will magically
                  appear right inside your connected Google Spreadsheet
                  instantly!
                </p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Table Container with Fixed Height and Scroll */}
                <div
                  className="flex-1 overflow-y-auto md:pb-6  pt-0 mt-0"
                  style={{
                    maxHeight: "calc(100vh - 400px)",
                    minHeight: "400px",
                  }}
                >
                  <table className="w-full min-w-[700px] text-left border-collapse">
                    <thead className="sticky top-0 bg-neutral-900 z-40">
                      <tr className="border-b border-neutral-800 text-neutral-400 text-xs md:text-sm font-semibold uppercase tracking-wider">
                        <th className="p-4 px-4 w-1/5 hidden sm:table-cell">
                          Ticket ID
                        </th>
                        <th className="p-4 px-4 w-1/4">Task Title</th>
                        <th className="p-4 px-4 w-32 whitespace-nowrap">
                          Date
                        </th>
                        <th className="p-4 px-4 w-32 whitespace-nowrap">
                          Time Taken
                        </th>
                        <th className="p-4 px-4 w-32 whitespace-nowrap">
                          Shift
                        </th>
                        <th className="p-4 px-4 text-right w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {paginatedTickets.map((ticket, paginIdx) => {
                        const actualIdx = startIndex + paginIdx;
                        const rowColor = ticket.textColor || undefined;
                        return (
                          <tr
                            key={actualIdx}
                            className="group hover:bg-neutral-800/30 transition-colors"
                          >
                            <td className="py-4 px-4 font-mono text-sm hidden sm:table-cell">
                              <span
                                className="bg-neutral-800 px-2 py-1.5 rounded-md border border-neutral-700 inline-block shadow-sm"
                                style={rowColor ? { color: rowColor } : {}}
                              >
                                {ticket.id}
                              </span>
                            </td>
                            <td
                              className="py-4 px-4 font-medium"
                              style={rowColor ? { color: rowColor } : {}}
                            >
                              {ticket.title}
                            </td>
                            <td
                              className="py-4 px-4 text-sm whitespace-nowrap"
                              style={
                                rowColor
                                  ? { color: rowColor }
                                  : { color: "#a3a3a3" }
                              }
                            >
                              {ticket.date}
                            </td>
                            <td
                              className="py-4 px-4 text-sm whitespace-nowrap"
                              style={
                                rowColor
                                  ? { color: rowColor }
                                  : { color: "#d4d4d4" }
                              }
                            >
                              {ticket.timeTaken || "-"}
                            </td>
                            <td className="py-4 px-4 text-neutral-400 text-sm">
                              <div className="flex flex-wrap gap-1">
                                {(Array.isArray(ticket.shift)
                                  ? ticket.shift
                                  : ticket.shift
                                    ? [ticket.shift]
                                    : []
                                ).map((s: string) => (
                                  <span
                                    key={s}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                                      s === "First Half"
                                        ? "bg-blue-900/30 text-blue-400 border border-blue-800/50"
                                        : s === "Second Half"
                                          ? "bg-purple-900/30 text-purple-400 border border-purple-800/50"
                                          : s === "Off Shift"
                                            ? "bg-neutral-800 text-neutral-400 border border-neutral-700"
                                            : "bg-amber-900/30 text-amber-400 border border-amber-800/50"
                                    }`}
                                  >
                                    {s}
                                  </span>
                                ))}
                                {(!ticket.shift ||
                                  (Array.isArray(ticket.shift) &&
                                    ticket.shift.length === 0)) && (
                                  <span className="text-neutral-600">-</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex gap-2 justify-end md:opacity-0 md:group-hover:opacity-100 opacity-100 focus:opacity-100">
                                <button
                                  onClick={() => handleEditTicket(actualIdx)}
                                  className="text-neutral-600 hover:text-blue-400 transition-colors p-2 rounded-lg hover:bg-blue-500/10 cursor-pointer disabled:opacity-0"
                                  title="Edit ticket"
                                  disabled={isSaving}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleRemoveTicket(actualIdx)}
                                  className="text-neutral-600 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10 cursor-pointer disabled:opacity-0"
                                  title="Remove ticket"
                                  disabled={isSaving}
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="border-t border-neutral-800 p-4 md:p-6 flex items-center justify-between">
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <div className="flex items-center gap-2">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 rounded-lg font-medium transition-colors cursor-pointer ${
                              currentPage === page
                                ? "bg-emerald-600 text-white"
                                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                            }`}
                          >
                            {page}
                          </button>
                        ),
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
