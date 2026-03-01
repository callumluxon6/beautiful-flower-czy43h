// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar as CalendarIcon, Map as MapIcon, Kanban, Briefcase, 
  FileBox, Plus, Lock, Unlock, Paperclip, MapPin, CheckCircle, 
  Circle, ChevronRight, ChevronLeft, Clock, MapPinned, 
  User, Image as ImageIcon, FileText, Trash2, Edit2, X, Settings, 
  ZoomIn, ZoomOut, Download, Home, Plane, Users, Palette, Info
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, onSnapshot, 
  updateDoc, deleteDoc, addDoc 
} from 'firebase/firestore';
import { 
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject 
} from 'firebase/storage';

// --- FIREBASE INITIALISATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBW9BBiec3uLxfaCPoARHscx0f-jkO8ze4",
  authDomain: "trip-planner-app-f3c3b.firebaseapp.com",
  projectId: "trip-planner-app-f3c3b",
  storageBucket: "trip-planner-app-f3c3b.firebasestorage.app",
  messagingSenderId: "897960074763",
  appId: "1:897960074763:web:387259291ce67b1a67710e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'trip-planner-pro';

// --- UTILITIES & CONSTANTS ---
const GOOGLE_MAPS_API_KEY = 'AIzaSyDX8VrnbT0LT1rKzcTQ3CkdsgS2ejyGUOw';

const formatTime = (timeString) => {
  if (!timeString) return '';
  const [h, m] = timeString.split(':');
  return `${h}:${m}`;
};

const generateDatesForTrip = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  const dates = [];
  
  // Parse strictly as UTC to avoid Daylight Saving Time (DST) shifts
  // causing duplicate or skipped days when crossing time changes.
  let current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  
  if (isNaN(current) || isNaN(end) || current > end) {
    const today = new Date().toISOString().split('T')[0];
    return [new Date(`${today}T00:00:00Z`)];
  }

  let safeGuard = 0;
  while (current <= end && safeGuard < 100) { // 100 day max trip limit for safety
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
    safeGuard++;
  }
  return dates;
};

// Available colours for travellers
const THEME_COLOURS = [
  { id: 'pink', name: 'Pink', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
  { id: 'blue', name: 'Blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { id: 'emerald', name: 'Green', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  { id: 'amber', name: 'Orange', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  { id: 'purple', name: 'Purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  { id: 'slate', name: 'Grey', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
];
const DEFAULT_THEME = { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-700' };

// --- MAIN APPLICATION COMPONENT ---
export default function TripPlannerApp() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  
  // App Navigation State
  const [currentTripId, setCurrentTripId] = useState(null); // null = Home Screen
  const [activeTab, setActiveTab] = useState('calendar');
  
  // Data State
  const [trips, setTrips] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [packingList, setPackingList] = useState([]);
  const [vaultDocs, setVaultDocs] = useState([]);
  
  // Modal States
  const [isTripSettingsOpen, setIsTripSettingsOpen] = useState(false);
  const [isLoggerOpen, setIsLoggerOpen] = useState(false);
  const [loggerType, setLoggerType] = useState('activity');
  const [loggerPrefill, setLoggerPrefill] = useState(null);
  const [loggerEditItem, setLoggerEditItem] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);

  // Load Google Maps Script Globally
  useEffect(() => {
    if (window.google && window.google.maps) return;
    if (document.querySelector(`script[src*="maps.googleapis.com"]`)) return;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,marker`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // --- AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("Custom token mismatch. Falling back to anonymous auth.");
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
        setAuthError(error.message || "An unknown authentication error occurred.");
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- DATA FETCHING ---
  useEffect(() => {
    if (!user) return;
    const basePath = [];
    
    // Trips
    const unsubTrips = onSnapshot(collection(db, ...basePath, 'trips'), 
      (snapshot) => setTrips(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error("Trips Error:", error)
    );
    // Activities
    const unsubActivities = onSnapshot(collection(db, ...basePath, 'activities'), 
      (snapshot) => setActivities(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error("Activities Error:", error)
    );
    // Tasks
    const unsubTasks = onSnapshot(collection(db, ...basePath, 'tasks'), 
      (snapshot) => setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error("Tasks Error:", error)
    );
    // Packing
    const unsubPacking = onSnapshot(collection(db, ...basePath, 'packingList'), 
      (snapshot) => setPackingList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.order - b.order)),
      (error) => console.error("Packing Error:", error)
    );
    // Vault
    const unsubVault = onSnapshot(collection(db, ...basePath, 'vault'), 
      (snapshot) => setVaultDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error("Vault Error:", error)
    );

    return () => {
      unsubTrips(); unsubActivities(); unsubTasks(); unsubPacking(); unsubVault();
    };
  }, [user]);

  // Seed Default Trip if none exists
  useEffect(() => {
    if (user && trips.length === 0) {
      const seedDefaultTrip = async () => {
        const basePath = [];
        await addDoc(collection(db, ...basePath, 'trips'), {
          title: 'Japan 2026',
          startDate: '2026-03-20',
          endDate: '2026-04-06',
          travelers: [
            { id: 't1', name: 'Alicia', color: 'pink' },
            { id: 't2', name: 'Callum', color: 'blue' }
          ],
          locations: ['Tokyo', 'Mt. Fuji', 'Osaka', 'Nara', 'Kyoto', 'Flying'],
          dailyLocations: {}
        });
      };
      const timer = setTimeout(() => seedDefaultTrip(), 2000);
      return () => clearTimeout(timer);
    }
  }, [user, trips.length]);

  // --- HELPERS ---
  const currentTrip = useMemo(() => trips.find(t => t.id === currentTripId), [trips, currentTripId]);
  
  // Filter items for current trip (include legacy items missing a tripId in the default trip context)
  const tripActivities = useMemo(() => activities.filter(a => a.tripId === currentTripId || (!a.tripId && trips.length > 0 && currentTripId === trips[0]?.id)), [activities, currentTripId, trips]);
  const tripTasks = useMemo(() => tasks.filter(t => t.tripId === currentTripId || (!t.tripId && trips.length > 0 && currentTripId === trips[0]?.id)), [tasks, currentTripId, trips]);
  const tripPacking = useMemo(() => packingList.filter(p => p.tripId === currentTripId || (!p.tripId && trips.length > 0 && currentTripId === trips[0]?.id)), [packingList, currentTripId, trips]);
  const tripVault = useMemo(() => vaultDocs.filter(v => v.tripId === currentTripId || (!v.tripId && trips.length > 0 && currentTripId === trips[0]?.id)), [vaultDocs, currentTripId, trips]);

  const openLogger = (type = 'activity', prefill = null, editItem = null) => {
    setLoggerType(type);
    setLoggerPrefill(prefill);
    setLoggerEditItem(editItem);
    setIsLoggerOpen(true);
  };

  if (authError) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Authentication Failed</h2>
          <p className="text-sm text-rose-600 font-medium mb-6 break-words">{authError}</p>
          <div className="text-xs text-slate-600 bg-slate-50 p-4 rounded-lg text-left border border-slate-100">
            <p className="font-bold text-slate-800 mb-2">How to fix this error:</p>
            <ol className="list-decimal pl-4 space-y-2">
              <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-semibold">Firebase Console</a>.</li>
              <li>Ensure the <strong>Anonymous</strong> sign-in provider is <strong>Enabled</strong>.</li>
              <li>Ensure your API Key has no HTTP referrer restrictions blocking this page.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (!user || (trips.length === 0 && !currentTripId)) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-medium">Loading Planner...</p>
        </div>
      </div>
    );
  }

  // --- HOME SCREEN VIEW ---
  if (!currentTripId) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 md:p-12 font-sans">
        <div className="max-w-6xl mx-auto">
          <header className="mb-10 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Trip Planner</h1>
              <p className="text-slate-500 mt-1">Select a trip or start a new adventure.</p>
            </div>
          </header>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* New Trip Button */}
            <button 
              onClick={() => setIsTripSettingsOpen(true)}
              className="h-48 border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
            >
              <div className="h-16 w-16 bg-slate-100 group-hover:bg-indigo-100 rounded-full flex items-center justify-center mb-3 transition-colors">
                <Plus size={32} className="stroke-[2.5]" />
              </div>
              <span className="font-bold text-lg">New Trip...</span>
            </button>
            
            {/* Trip Cards */}
            {trips.map(trip => (
              <button 
                key={trip.id}
                onClick={() => { setCurrentTripId(trip.id); setActiveTab('calendar'); }}
                className="h-48 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col text-left hover:shadow-lg hover:-translate-y-1 transition-all group"
              >
                <div className="h-24 bg-gradient-to-br from-indigo-500 to-purple-600 p-5 relative">
                  <Plane className="absolute top-5 right-5 text-white/30" size={48} />
                  <h2 className="text-white font-bold text-xl truncate relative z-10 shadow-sm">{trip.title}</h2>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Dates</p>
                    <p className="text-sm text-slate-800 font-semibold">
                      {new Date(trip.startDate).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })} – {new Date(trip.endDate).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex -space-x-2">
                    {trip.travelers?.map((t, i) => {
                      const theme = THEME_COLOURS.find(c => c.id === t.color) || DEFAULT_THEME;
                      return (
                        <div key={i} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold ${theme.bg} ${theme.text}`} title={t.name}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {isTripSettingsOpen && (
          <TripSettingsModal 
            isOpen={isTripSettingsOpen} 
            onClose={() => setIsTripSettingsOpen(false)} 
            trip={null} // Null indicates creating a new trip
            currentUser={user}
            onSave={(newTripId) => {
              setIsTripSettingsOpen(false);
              if (newTripId) setCurrentTripId(newTripId);
            }}
          />
        )}
      </div>
    );
  }

  // --- INSIDE A TRIP VIEW ---
  if (!currentTrip) return null; // Safety check

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 shadow-sm z-10">
        <div className="p-6 border-b border-slate-100">
          <button 
            onClick={() => setCurrentTripId(null)} 
            className="flex items-center text-xs font-bold text-slate-400 hover:text-indigo-600 mb-4 transition-colors uppercase tracking-wider"
          >
            <Home size={14} className="mr-1.5" /> All Trips
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900 tracking-tight leading-tight">{currentTrip.title}</h1>
              <p className="text-xs text-slate-500 mt-1.5 font-medium">
                {new Date(currentTrip.startDate).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })} – {new Date(currentTrip.endDate).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}
              </p>
            </div>
            <button onClick={() => setIsTripSettingsOpen(true)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors shrink-0">
              <Settings size={18} />
            </button>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <NavButton icon={CalendarIcon} label="Itinerary" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          <NavButton icon={MapIcon} label="Navigator" isActive={activeTab === 'map'} onClick={() => setActiveTab('map')} />
          <NavButton icon={Kanban} label="Tasks" isActive={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} />
          <NavButton icon={Briefcase} label="Packing" isActive={activeTab === 'packing'} onClick={() => setActiveTab('packing')} />
          <NavButton icon={FileBox} label="Vault" isActive={activeTab === 'vault'} onClick={() => setActiveTab('vault')} />
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 relative overflow-hidden flex flex-col pb-16 md:pb-0">
        {/* Mobile Header (Only visible on small screens inside a trip) */}
        <div className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center z-20">
           <button onClick={() => setCurrentTripId(null)} className="p-2 -ml-2 text-slate-500 hover:text-indigo-600">
            <Home size={20} />
          </button>
          <h1 className="font-bold text-slate-800 truncate px-4">{currentTrip.title}</h1>
          <button onClick={() => setIsTripSettingsOpen(true)} className="p-2 -mr-2 text-slate-500">
            <Settings size={20} />
          </button>
        </div>

        {activeTab === 'calendar' && <CalendarView activities={tripActivities} vaultDocs={tripVault} openLogger={openLogger} currentTrip={currentTrip} currentUser={user} onViewDoc={setViewingDoc} />}
        {activeTab === 'map' && <MapView activities={tripActivities} currentTrip={currentTrip} />}
        {activeTab === 'kanban' && <KanbanView tasks={tripTasks} currentTrip={currentTrip} currentUser={user} openLogger={openLogger} />}
        {activeTab === 'packing' && <PackingView packingList={tripPacking} currentTrip={currentTrip} currentUser={user} />}
        {activeTab === 'vault' && <VaultView vaultDocs={tripVault} activities={tripActivities} onViewDoc={setViewingDoc} />}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-safe z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <MobileNavButton icon={CalendarIcon} label="Itinerary" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
        <MobileNavButton icon={MapIcon} label="Map" isActive={activeTab === 'map'} onClick={() => setActiveTab('map')} />
        <MobileNavButton icon={Kanban} label="Tasks" isActive={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} />
        <MobileNavButton icon={Briefcase} label="Packing" isActive={activeTab === 'packing'} onClick={() => setActiveTab('packing')} />
        <MobileNavButton icon={FileBox} label="Vault" isActive={activeTab === 'vault'} onClick={() => setActiveTab('vault')} />
      </nav>

      {/* GLOBAL LOGGER BUTTON (FAB) */}
      <button 
        onClick={() => openLogger('activity')}
        className="fixed bottom-20 md:bottom-8 right-6 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-4 shadow-lg shadow-rose-200 transition-transform transform hover:scale-105 active:scale-95 z-50 flex items-center justify-center"
      >
        <Plus size={24} className="stroke-[2.5]" />
      </button>

      {/* MODALS */}
      {isTripSettingsOpen && (
        <TripSettingsModal 
          isOpen={isTripSettingsOpen} 
          onClose={() => setIsTripSettingsOpen(false)} 
          trip={currentTrip}
          currentUser={user}
          onSave={() => setIsTripSettingsOpen(false)}
        />
      )}

      {isLoggerOpen && (
        <GlobalLoggerModal 
          isOpen={isLoggerOpen} 
          onClose={() => setIsLoggerOpen(false)} 
          initialType={loggerType}
          prefill={loggerPrefill}
          editItem={loggerEditItem}
          user={user}
          currentTrip={currentTrip}
          activities={tripActivities}
        />
      )}

      {viewingDoc && (
        <DocumentViewerModal 
          doc={viewingDoc} 
          onClose={() => setViewingDoc(null)} 
          currentUser={user}
        />
      )}
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NavButton({ icon: Icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
        isActive 
          ? 'bg-indigo-50 text-indigo-700 font-semibold' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={20} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
      <span>{label}</span>
    </button>
  );
}

function MobileNavButton({ icon: Icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-16 h-12 transition-colors ${
        isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <Icon size={22} className={isActive ? 'fill-indigo-50/50' : ''} />
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  );
}

// ==========================================
// 1. OUTLOOK-STYLE CALENDAR (The Itinerary)
// ==========================================
function CalendarView({ activities, vaultDocs, openLogger, currentTrip, currentUser, onViewDoc }) {
  const tripDates = useMemo(() => generateDatesForTrip(currentTrip.startDate, currentTrip.endDate), [currentTrip]);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const initialDateIndex = useMemo(() => {
    const idx = tripDates.findIndex(d => d.toISOString().split('T')[0] === todayStr);
    return idx !== -1 ? idx : 0; // Default to first day if today isn't in trip
  }, [todayStr, tripDates]);

  const [selectedDateIndex, setSelectedDateIndex] = useState(initialDateIndex);
  const [viewMode, setViewMode] = useState('day'); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [actionActivity, setActionActivity] = useState(null);
  
  // Default zoom 0.5 allows viewing 6am to 7pm (~13 hours)
  const [zoomLevel, setZoomLevel] = useState(0.5); 
  
  // Safety check if dates changed drastically
  const safeIndex = Math.min(selectedDateIndex, tripDates.length - 1);
  const currentDate = tripDates[safeIndex] || tripDates[0] || new Date();
  
  const dateStrForCity = currentDate.toISOString().split('T')[0];
  const currentCity = currentTrip.dailyLocations?.[dateStrForCity] || 'Location Not Set';
  
  const visibleDates = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    return tripDates.slice(safeIndex, Math.min(safeIndex + 7, tripDates.length));
  }, [safeIndex, viewMode, currentDate, tripDates]);

  const visibleActivities = useMemo(() => {
    const datesStr = visibleDates.map(d => d.toISOString().split('T')[0]);
    return activities
      .filter(a => datesStr.includes(a.date))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [activities, visibleDates]);

  const timeSlots = Array.from({ length: 36 }, (_, i) => {
    const hour = Math.floor(i / 2) + 6;
    const mins = i % 2 === 0 ? '00' : '30';
    return `${hour.toString().padStart(2, '0')}:${mins}`;
  });

  const nextDay = () => setSelectedDateIndex(Math.min(tripDates.length - 1, safeIndex + (viewMode === 'day' ? 1 : 7)));
  const prevDay = () => setSelectedDateIndex(Math.max(0, safeIndex - (viewMode === 'day' ? 1 : 7)));

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="bg-white border-b border-slate-200 z-20">
        {viewMode === 'day' && (
          <div className="py-2 px-4 text-center font-semibold tracking-widest uppercase text-xs text-white bg-indigo-600">
            {currentCity}
          </div>
        )}
        
        <div className="flex items-center justify-between p-4">
          <button onClick={prevDay} disabled={safeIndex === 0} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full disabled:opacity-30">
            <ChevronLeft size={24} />
          </button>
          
          <div className="text-center flex-1">
            {viewMode === 'day' ? (
              <>
                <h2 className="text-xl font-bold text-slate-800">
                  {currentDate.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}
                </h2>
                <p className="text-sm text-slate-500">Day {safeIndex + 1} of {tripDates.length}</p>
              </>
            ) : (
              <h2 className="text-lg font-bold text-slate-800">
                {visibleDates[0].toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })} – {visibleDates[visibleDates.length-1].toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}
              </h2>
            )}
          </div>
          
          <button onClick={nextDay} disabled={safeIndex >= tripDates.length - (viewMode === 'week' ? 7 : 1)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full disabled:opacity-30">
            <ChevronRight size={24} />
          </button>
        </div>

        {/* View Toggle, Zoom & Settings */}
        <div className="px-4 pb-3 flex justify-between items-center border-t border-slate-50 pt-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-50 text-indigo-600 hover:bg-indigo-50 border border-indigo-100 transition-colors flex items-center gap-2 shadow-sm"
          >
            <MapPinned size={16} /> Set Locations
          </button>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-lg items-center hidden sm:flex">
              <button onClick={() => setZoomLevel(z => Math.max(0.3, z - 0.1))} className="p-1 text-slate-500 hover:text-indigo-600 rounded-md">
                <ZoomOut size={16}/>
              </button>
              <span className="text-xs font-medium text-slate-600 select-none w-10 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.1))} className="p-1 text-slate-500 hover:text-indigo-600 rounded-md">
                <ZoomIn size={16}/>
              </button>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'day' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Day
              </button>
              <button 
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'week' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Week
              </button>
            </div>
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <DailyLocationsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          currentTrip={currentTrip}
          tripDates={tripDates}
          currentUser={currentUser}
        />
      )}

      {actionActivity && (
        <ActivityActionModal
          activity={actionActivity}
          vaultDocs={vaultDocs}
          onClose={() => setActionActivity(null)}
          onEdit={() => {
            setActionActivity(null);
            openLogger('activity', null, actionActivity);
          }}
          onViewDoc={(doc) => {
            setActionActivity(null);
            onViewDoc(doc);
          }}
        />
      )}

      {/* Calendar Grid */}
      <div className="flex-1 overflow-y-auto relative pb-20">
        <div className="flex min-w-full">
          {/* Time Labels */}
          <div className="w-16 flex-shrink-0 border-r border-slate-100">
            {timeSlots.map((time) => (
              <div key={time} style={{ height: `${Math.max(20, 64 * zoomLevel)}px` }} className="relative">
                <span className="absolute -top-2 right-2 text-xs font-medium text-slate-400">
                  {time.endsWith('00') ? time : ''}
                </span>
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {visibleDates.map((date) => {
            const dateStr = date.toISOString().split('T')[0];
            const dayActivities = visibleActivities.filter(a => a.date === dateStr);
            const dayCity = currentTrip.dailyLocations?.[dateStr] || 'Not Set';
            
            return (
              <div key={dateStr} className="flex-1 min-w-[120px] border-r border-slate-100 relative">
                {viewMode === 'week' && (
                  <div className="sticky top-0 bg-white/90 backdrop-blur z-10 text-center py-2 border-b border-slate-100 flex flex-col items-center">
                    <div className="text-xs text-slate-500 uppercase">{date.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' })}</div>
                    <div className="font-bold text-slate-800">{date.getUTCDate()}</div>
                    <div className="text-[10px] font-medium text-indigo-600 mt-1 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 truncate max-w-[90%]">
                      {dayCity}
                    </div>
                  </div>
                )}
                
                {timeSlots.map((time) => (
                  <div 
                    key={time} 
                    onClick={() => openLogger('activity', { date: dateStr, startTime: time })}
                    style={{ height: `${Math.max(20, 64 * zoomLevel)}px` }}
                    className={`relative cursor-pointer hover:bg-rose-50/50 border-b border-slate-50 ${time.endsWith('30') ? 'border-dashed' : ''}`}
                  ></div>
                ))}

                {/* Render Activities */}
                {dayActivities.map(activity => {
                  const slotHeight = Math.max(20, 64 * zoomLevel);
                  const parseTime = (t) => {
                    if(!t) return 0;
                    const [h, m] = t.split(':').map(Number);
                    return (h - 6) * (slotHeight * 2) + (m / 30) * slotHeight; 
                  };
                  
                  const top = parseTime(activity.startTime) + (viewMode === 'week' ? 48 : 0);
                  const rawHeight = parseTime(activity.endTime || activity.startTime) - parseTime(activity.startTime);
                  const height = Math.max(rawHeight || slotHeight * 2, slotHeight); 

                  return (
                    <div 
                      key={activity.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activity.linkedDocID) setActionActivity(activity);
                        else openLogger('activity', null, activity);
                      }}
                      className="absolute left-1 right-1 rounded-lg bg-indigo-50 border border-indigo-200 p-1.5 shadow-sm overflow-hidden group flex flex-col cursor-pointer hover:shadow-md hover:bg-indigo-100 transition-all z-10"
                      style={{ top: `${top + 2}px`, height: `${height - 4}px` }}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-xs text-indigo-900 leading-tight pr-1">
                          {activity.title}
                        </h4>
                        {activity.linkedDocID && <Paperclip size={16} className="text-indigo-600 flex-shrink-0 stroke-[2.5]" />}
                      </div>
                      {height > 40 && viewMode === 'day' && (
                        <p className="text-[10px] text-indigo-600 mt-1 flex items-center space-x-1 truncate">
                          <MapPin size={10} />
                          <span className="truncate">{activity.locationName}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. INTERACTIVE MAPPING (The Navigator)
// ==========================================
function MapView({ activities, currentTrip }) {
  const tripDates = useMemo(() => generateDatesForTrip(currentTrip.startDate, currentTrip.endDate), [currentTrip]);
  const todayStr = new Date().toISOString().split('T')[0];
  const tripStartStr = tripDates[0]?.toISOString().split('T')[0];
  const tripEndStr = tripDates[tripDates.length - 1]?.toISOString().split('T')[0];
  const isDuringTrip = todayStr >= tripStartStr && todayStr <= tripEndStr;

  const [viewMode, setViewMode] = useState(isDuringTrip ? 'day' : 'all');
  const [selectedDate, setSelectedDate] = useState(isDuringTrip ? todayStr : tripStartStr);
  
  const mapContainerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    const checkGoogle = setInterval(() => {
      if (window.google && window.google.maps) {
        setMapLoaded(true);
        clearInterval(checkGoogle);
      }
    }, 100);
    const timeout = setTimeout(() => {
      if (!mapLoaded) { setMapError(true); clearInterval(checkGoogle); }
    }, 10000);
    return () => { clearInterval(checkGoogle); clearTimeout(timeout); };
  }, [mapLoaded]);

  useEffect(() => {
    if (mapLoaded && mapContainerRef.current && !mapInstance && window.google && window.google.maps) {
      try {
        const map = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: 35.6762, lng: 139.6503 }, // Default General Center
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          mapId: 'DEMO_MAP_ID',
        });
        setMapInstance(map);
      } catch (err) {
        console.error("Map initialization error:", err);
        setMapError(true);
      }
    }
  }, [mapLoaded, mapContainerRef, mapInstance]);

  const displayActivities = useMemo(() => {
    let filtered = activities;
    if (viewMode === 'day') {
      filtered = activities.filter(a => a.date === selectedDate);
    }
    return filtered.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime || '').localeCompare(b.startTime || '');
    }).map((a, i) => ({ ...a, number: i + 1 }));
  }, [activities, viewMode, selectedDate]);

  useEffect(() => {
    if (!mapInstance || !window.google || !window.google.maps.marker) return;

    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    if (polylineRef.current) polylineRef.current.setMap(null);

    const pathCoordinates = [];
    const bounds = new window.google.maps.LatLngBounds();
    const { AdvancedMarkerElement } = window.google.maps.marker;

    displayActivities.forEach((activity) => {
      if (!activity.coords) return;
      
      const position = { lat: activity.coords.lat, lng: activity.coords.lng };
      pathCoordinates.push(position);
      bounds.extend(position);

      const pinElement = document.createElement('div');
      pinElement.className = 'relative cursor-pointer group';
      pinElement.innerHTML = `
        <div class="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded shadow text-[11px] font-bold text-slate-700 select-none whitespace-nowrap">
          ${formatTime(activity.startTime)}
        </div>
        <div class="w-8 h-8 bg-rose-600 text-white rounded-full flex items-center justify-center font-bold shadow-md shadow-rose-900/20 border-2 border-white transform transition-transform group-hover:scale-110 select-none">
          ${activity.number}
        </div>
      `;

      try {
        const marker = new AdvancedMarkerElement({
          position, map: mapInstance, content: pinElement,
          title: `${activity.title} (${formatTime(activity.startTime)}) - ${activity.locationName}`,
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div class="p-2 min-w-[150px]">
              <h4 class="font-bold text-slate-800 text-sm m-0 leading-tight">${activity.title}</h4>
              <p class="text-xs text-slate-500 mt-1 mb-0">${activity.locationName}</p>
            </div>
          `
        });

        marker.addListener('click', () => {
          infoWindow.open({ anchor: marker, map: mapInstance });
        });
        markersRef.current.push(marker);
      } catch (err) {
        console.error("Marker rendering error:", err);
      }
    });

    if (pathCoordinates.length > 0) {
      polylineRef.current = new window.google.maps.Polyline({
        path: pathCoordinates, geodesic: true, strokeColor: '#4f46e5',
        strokeOpacity: 1.0, strokeWeight: 3,
      });
      polylineRef.current.setMap(mapInstance);
      mapInstance.fitBounds(bounds);
      if (pathCoordinates.length === 1) mapInstance.setZoom(14);
    } else {
      mapInstance.setZoom(2); // Zoom out to global view if no specific pins
    }
  }, [displayActivities, mapInstance]);

  return (
    <div className="flex flex-col h-full bg-slate-100 relative overflow-hidden">
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="flex bg-white rounded-lg shadow-sm p-1 max-w-xs mx-auto pointer-events-auto">
          <button 
            onClick={() => setViewMode('day')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${viewMode === 'day' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
          >
            Day View
          </button>
          <button 
            onClick={() => setViewMode('all')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${viewMode === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
          >
            Entire Trip
          </button>
        </div>
        
        {viewMode === 'day' && (
          <select 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="self-center bg-white shadow-sm border border-slate-200 text-sm font-medium text-slate-700 rounded-lg px-3 py-2 outline-none pointer-events-auto"
          >
            {tripDates.map((d, i) => (
              <option key={d.toISOString()} value={d.toISOString().split('T')[0]}>
                Day {i + 1}: {d.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric' })}
              </option>
            ))}
          </select>
        )}
      </div>

      {mapError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10 p-6 text-center">
          <MapPinned className="w-12 h-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">Map Unavailable</h3>
        </div>
      ) : !mapLoaded ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
        </div>
      ) : null}
      <div ref={mapContainerRef} className={`flex-1 w-full h-full bg-[#e5e3df] ${mapError ? 'opacity-0' : 'opacity-100'}`} />
    </div>
  );
}

// ==========================================
// 3. KANBAN BOARD (Tasks)
// ==========================================
function KanbanView({ tasks, currentTrip, currentUser, openLogger }) {
  const columns = ['Not Started', 'In Progress', 'Completed'];
  const [filter, setFilter] = useState('All');
  
  const travelersList = currentTrip?.travelers || [];
  const filterOptions = ['All', ...travelersList.map(t => t.name)];

  const moveTask = async (task, newStatus) => {
    if (!currentUser) return;
    const basePath = [];
    await updateDoc(doc(db, ...basePath, 'tasks', task.id), { status: newStatus });
  };

  const deleteTask = async (taskId) => {
    if (!currentUser) return;
    const basePath = [];
    await deleteDoc(doc(db, ...basePath, 'tasks', taskId));
  };

  const filteredTasks = tasks.filter(t => filter === 'All' || t.assignee === filter);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 border-b border-slate-200/60 bg-white flex justify-between items-center z-10 overflow-x-auto">
        <h2 className="text-xl font-bold text-slate-800 shrink-0 mr-4">Trip Tasks</h2>
        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
          {filterOptions.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filter === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-x-auto flex space-x-4 p-4 pb-24 snap-x">
        {columns.map(status => (
          <div key={status} className="flex-shrink-0 w-80 bg-slate-100 rounded-2xl flex flex-col h-full max-h-full snap-center">
            <div className="p-4 border-b border-slate-200/60 flex justify-between items-center">
              <h3 className="font-semibold text-slate-700">{status}</h3>
              <span className="bg-slate-200 text-slate-600 text-xs px-2 py-1 rounded-full font-medium">
                {filteredTasks.filter(t => t.status === status).length}
              </span>
            </div>
            
            <div className="p-3 overflow-y-auto flex-1 space-y-3">
              {filteredTasks.filter(t => t.status === status).map(task => {
                const assigneeObj = travelersList.find(t => t.name === task.assignee);
                const theme = assigneeObj ? (THEME_COLOURS.find(c => c.id === assigneeObj.color) || DEFAULT_THEME) : DEFAULT_THEME;

                return (
                  <div 
                    key={task.id} 
                    onClick={() => openLogger('task', null, task)}
                    className={`p-4 rounded-xl shadow-sm border group cursor-pointer transition-colors ${theme.bg} ${theme.border} hover:border-slate-300`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-slate-800">{task.title}</h4>
                      <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="text-slate-300 hover:text-rose-500">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-slate-500 mb-4">
                      {task.assignee && <span className={`flex items-center font-medium ${theme.text}`}><User size={12} className="mr-1" /> {task.assignee}</span>}
                      {task.dueDate && <span className="flex items-center"><Clock size={12} className="mr-1" /> {task.dueDate}</span>}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                      <select 
                        value={task.status}
                        onChange={(e) => { e.stopPropagation(); moveTask(task, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs bg-white/50 border border-slate-200/50 outline-none text-slate-600 font-medium rounded p-1 cursor-pointer"
                      >
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. PACKING CHECKLIST
// ==========================================
function PackingView({ packingList, currentTrip, currentUser }) {
  const [newItemName, setNewItemName] = useState('');

  const togglePacked = async (item) => {
    if (!currentUser) return;
    const basePath = [];
    await updateDoc(doc(db, ...basePath, 'packingList', item.id), { isPacked: !item.isPacked });
  };

  const updateItemName = async (id, newName) => {
    if (!currentUser || !newName.trim()) return;
    const basePath = [];
    await updateDoc(doc(db, ...basePath, 'packingList', id), { itemName: newName.trim() });
  };

  const deleteItem = async (id) => {
    if (!currentUser) return;
    const basePath = [];
    await deleteDoc(doc(db, ...basePath, 'packingList', id));
  };

  const handleQuickAdd = async (e) => {
    if (e.key === 'Enter' && newItemName.trim() && currentUser) {
      const basePath = [];
      await addDoc(collection(db, ...basePath, 'packingList'), {
        tripId: currentTrip.id,
        itemName: newItemName.trim(),
        isPacked: false,
        order: packingList.length
      });
      setNewItemName('');
    }
  };

  const packedCount = packingList.filter(i => i.isPacked).length;
  const progress = packingList.length > 0 ? (packedCount / packingList.length) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-white max-w-3xl mx-auto w-full">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Trip Essentials</h2>
        <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1">
          <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="text-xs text-slate-500 text-right">{packedCount} of {packingList.length} packed</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1 pb-24">
        {packingList.map(item => (
          <div key={item.id} className="flex items-center space-x-3 p-3 hover:bg-slate-50 rounded-xl group transition-colors border border-transparent hover:border-slate-100">
            <button onClick={() => togglePacked(item)} className="text-slate-400 hover:text-emerald-500 transition-colors">
              {item.isPacked ? <CheckCircle className="text-emerald-500" /> : <Circle />}
            </button>
            <input 
              type="text" 
              defaultValue={item.itemName}
              onBlur={(e) => updateItemName(item.id, e.target.value)}
              className={`flex-1 bg-transparent outline-none text-slate-700 font-medium ${item.isPacked ? 'line-through text-slate-400' : ''}`}
            />
            <button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-2 transition-all">
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        <div className="flex items-center space-x-3 p-3 text-slate-400 mt-4 border-t border-dashed border-slate-200">
          <Plus size={24} />
          <input 
            type="text" 
            placeholder="Quick add item... (Press Enter)"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={handleQuickAdd}
            className="flex-1 bg-transparent outline-none font-medium placeholder:text-slate-400 focus:text-slate-800"
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. DOCUMENT VAULT
// ==========================================
function VaultView({ vaultDocs, activities, onViewDoc }) {
  return (
    <div className="h-full bg-slate-50 p-6 overflow-y-auto pb-24">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Travel Vault</h2>
      
      {vaultDocs.length === 0 ? (
        <div className="text-center py-20">
          <FileBox className="mx-auto h-16 w-16 text-slate-300 mb-4" />
          <p className="text-slate-500">No documents saved yet.</p>
          <p className="text-sm text-slate-400 mt-1">Upload tickets, boarding passes, and vouchers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {vaultDocs.map(doc => {
            const linkedActivity = activities.find(a => a.id === doc.relatedActivityID);
            return (
              <div 
                key={doc.id} 
                onClick={() => onViewDoc(doc)}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="h-32 bg-slate-100 flex items-center justify-center relative">
                  {doc.type === 'image' ? <ImageIcon size={32} className="text-slate-400" /> : <FileText size={32} className="text-slate-400" />}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white font-medium text-sm">View Document</span>
                  </div>
                </div>
                <div className="p-3 border-t border-slate-100">
                  <h4 className="font-semibold text-sm text-slate-800 truncate">{doc.fileName}</h4>
                  {doc.targetDate && <p className="text-xs text-slate-500 mt-1">{doc.targetDate}</p>}
                  {linkedActivity && <p className="text-[10px] text-indigo-600 mt-1 truncate bg-indigo-50 inline-block px-1.5 py-0.5 rounded">Linked: {linkedActivity.title}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// TRIP SETTINGS MODAL (Create / Edit Trip)
// ==========================================
function TripSettingsModal({ isOpen, onClose, trip, currentUser, onSave }) {
  const isEditMode = !!trip;
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'travelers'
  const [loading, setLoading] = useState(false);

  // States
  const [title, setTitle] = useState(trip?.title || '');
  const [startDate, setStartDate] = useState(trip?.startDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(trip?.endDate || new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0]);
  
  const [travelers, setTravelers] = useState(trip?.travelers || [{ id: Date.now().toString(), name: '', color: 'blue' }]);
  const [locations, setLocations] = useState(trip?.locations || ['Home Base']);
  const [newLocation, setNewLocation] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentUser || !title.trim()) return;
    setLoading(true);

    const basePath = [];
    const cleanedTravelers = travelers.filter(t => t.name.trim() !== '');

    const tripData = {
      title,
      startDate,
      endDate,
      travelers: cleanedTravelers,
      locations,
      dailyLocations: trip?.dailyLocations || {}
    };

    try {
      if (isEditMode) {
        await updateDoc(doc(db, ...basePath, 'trips', trip.id), tripData);
        onSave(trip.id);
      } else {
        const docRef = await addDoc(collection(db, ...basePath, 'trips'), tripData);
        onSave(docRef.id);
      }
    } catch (err) {
      console.error("Error saving trip:", err);
      setLoading(false);
    }
  };

  const addTraveler = () => setTravelers([...travelers, { id: Date.now().toString(), name: '', color: 'slate' }]);
  const updateTraveler = (id, field, value) => setTravelers(travelers.map(t => t.id === id ? { ...t, [field]: value } : t));
  const removeTraveler = (id) => setTravelers(travelers.filter(t => t.id !== id));

  const addLocation = () => {
    if (newLocation.trim() && !locations.includes(newLocation.trim())) {
      setLocations([...locations, newLocation.trim()]);
      setNewLocation('');
    }
  };
  const removeLocation = (loc) => setLocations(locations.filter(l => l !== loc));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings className="text-indigo-600"/> {isEditMode ? 'Trip Settings' : 'Create New Trip'}
          </h2>
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-slate-100 bg-white">
          <button 
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
          >
            Details & Dates
          </button>
          <button 
            onClick={() => setActiveTab('travelers')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'travelers' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
          >
            Travellers & Locations
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'details' && (
            <div className="space-y-5 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Trip Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer in Italy" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 transition-colors" />
                </div>
              </div>
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mt-4 flex gap-3 text-sm text-indigo-800">
                <Info size={20} className="shrink-0 text-indigo-600"/>
                <p>These dates determine the length of your Itinerary calendar. Make sure they cover your entire trip including travel days.</p>
              </div>
            </div>
          )}

          {activeTab === 'travelers' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Travelers Section */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users size={14} /> Travellers
                </label>
                <div className="space-y-3">
                  {travelers.map((t, idx) => (
                    <div key={t.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <input 
                        type="text" 
                        value={t.name} 
                        onChange={(e) => updateTraveler(t.id, 'name', e.target.value)}
                        placeholder={`Traveller ${idx + 1}`} 
                        className="flex-1 bg-transparent px-2 outline-none font-medium text-slate-700"
                      />
                      <select 
                        value={t.color}
                        onChange={(e) => updateTraveler(t.id, 'color', e.target.value)}
                        className="bg-white border border-slate-200 text-sm rounded-lg px-2 py-1.5 outline-none"
                      >
                        {THEME_COLOURS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={() => removeTraveler(t.id)} className="p-2 text-slate-400 hover:text-rose-500 shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addTraveler} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    <Plus size={16} /> Add Traveller
                  </button>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* Locations Section */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin size={14} /> Available Macro Locations
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {locations.map(loc => (
                    <span key={loc} className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
                      {loc} <button onClick={() => removeLocation(loc)} className="hover:text-rose-500"><X size={14}/></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newLocation} 
                    onChange={(e) => setNewLocation(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                    placeholder="Add city or region..." 
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                  <button onClick={addLocation} className="bg-indigo-50 text-indigo-600 px-4 rounded-xl font-bold hover:bg-indigo-100">Add</button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">These populate the daily locations selector in your Itinerary.</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50">
          <button 
            onClick={handleSave}
            disabled={loading || !title.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center shadow-md shadow-indigo-200"
          >
            {loading ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// GLOBAL LOGGER MODAL
// ==========================================
function GlobalLoggerModal({ isOpen, onClose, initialType, prefill, editItem, user, currentTrip, activities }) {
  const isEditMode = !!editItem;
  const [type, setType] = useState(isEditMode ? initialType : (initialType || 'activity'));
  const [loading, setLoading] = useState(false);
  const tripDates = useMemo(() => generateDatesForTrip(currentTrip?.startDate, currentTrip?.endDate), [currentTrip]);

  const fallbackDate = tripDates.length > 0 ? tripDates[0].toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  // Form States
  const [title, setTitle] = useState(editItem?.title || '');
  const [date, setDate] = useState(editItem?.date || editItem?.dueDate || prefill?.date || fallbackDate);
  const [startTime, setStartTime] = useState(editItem?.startTime || prefill?.startTime || '10:00');
  const [endTime, setEndTime] = useState(editItem?.endTime || '');
  
  // Location States
  const [locationName, setLocationName] = useState(editItem?.locationName || '');
  const [selectedCoords, setSelectedCoords] = useState(editItem?.coords || null);
  const placesRef = useRef(null);
  
  // Task specific
  const travelersList = currentTrip?.travelers || [];
  const [assignee, setAssignee] = useState(editItem?.assignee || (travelersList[0]?.name || 'Unassigned'));
  const [status, setStatus] = useState(editItem?.status || 'Not Started');
  
  // Document specific
  const [linkedActivityID, setLinkedActivityID] = useState(editItem?.relatedActivityID || '');
  const [docFile, setDocFile] = useState(null);

  useEffect(() => {
    let autocomplete;
    let listener;
    let interval;

    const initAutocomplete = () => {
      if (type === 'activity' && window.google && window.google.maps && window.google.maps.places && placesRef.current) {
        autocomplete = new window.google.maps.places.Autocomplete(placesRef.current, { fields: ['geometry', 'name', 'formatted_address'] });
        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry && place.geometry.location) {
            setSelectedCoords({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
            setLocationName(place.name || place.formatted_address || '');
          }
        });
        return true;
      }
      return false;
    };

    if (!initAutocomplete()) interval = setInterval(() => { if (initAutocomplete()) clearInterval(interval); }, 500);

    return () => {
      if (interval) clearInterval(interval);
      if (listener && window.google && window.google.maps) window.google.maps.event.removeListener(listener);
    };
  }, [type, isOpen]);

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!user || !editItem) return;
    setLoading(true);
    const basePath = [];
    try {
      const collName = type === 'activity' ? 'activities' : (type === 'task' ? 'tasks' : 'packingList');
      await deleteDoc(doc(db, ...basePath, collName, editItem.id));
      onClose();
    } catch (error) { console.error("Delete Error:", error); } 
    finally { setLoading(false); }
  };
  
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user || !title.trim() || !currentTrip) return;
    setLoading(true);

    const basePath = [];
    const commonData = { tripId: currentTrip.id };

    try {
      if (type === 'activity') {
        const dataToSave = {
          ...commonData, title, date, startTime, endTime, locationName, 
          city: currentTrip.dailyLocations?.[date] || 'Not Set',
          coords: selectedCoords || null 
        };
        if (isEditMode) await updateDoc(doc(db, ...basePath, 'activities', editItem.id), dataToSave);
        else await addDoc(collection(db, ...basePath, 'activities'), dataToSave);
      } 
      else if (type === 'task') {
        const dataToSave = { ...commonData, title, assignee: assignee === 'Unassigned' ? '' : assignee, dueDate: date, status };
        if (isEditMode) await updateDoc(doc(db, ...basePath, 'tasks', editItem.id), dataToSave);
        else await addDoc(collection(db, ...basePath, 'tasks'), dataToSave);
      } 
      else if (type === 'packing') {
        if (isEditMode) await updateDoc(doc(db, ...basePath, 'packingList', editItem.id), { itemName: title });
        else await addDoc(collection(db, ...basePath, 'packingList'), { ...commonData, itemName: title, isPacked: false, order: 999 });
      } 
      else if (type === 'document') {
        let fileUrl = '#';
        let storagePath = null;
        let fileType = 'document';
        const fileName = docFile ? docFile.name : (title || 'Unnamed Document');

        if (docFile) {
          fileType = docFile.type.includes('image') ? 'image' : 'document';
          storagePath = `vault/${currentTrip.id}_${Date.now()}_${docFile.name}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, docFile);
          fileUrl = await getDownloadURL(storageRef);
        }

        const dataToSave = { ...commonData, fileName, type: fileType, targetDate: date, relatedActivityID: linkedActivityID, fileUrl, storagePath };
        const newDocRef = await addDoc(collection(db, ...basePath, 'vault'), dataToSave);
        if (linkedActivityID) await updateDoc(doc(db, ...basePath, 'activities', linkedActivityID), { linkedDocID: newDocRef.id });
      }
      onClose();
    } catch (error) { console.error("Save Error:", error); } 
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white w-full md:w-[500px] rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-4 duration-300">
        
        <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">{isEditMode ? 'Edit Item' : 'Quick Add'}</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 bg-white border-b border-slate-100">
          <div className="flex bg-slate-100 p-1.5 rounded-xl overflow-x-auto">
            {['activity', 'task', 'packing', 'document'].map(t => (
              <button
                key={t}
                disabled={isEditMode}
                onClick={() => setType(t)}
                className={`flex-1 py-2 px-2 min-w-fit text-xs sm:text-sm font-semibold rounded-lg capitalize transition-all ${
                  type === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              {type === 'packing' ? 'Item Name' : type === 'document' ? 'Document Title' : 'Title'}
            </label>
            <input 
              autoFocus required type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${type === 'activity' ? 'TeamLab Planets' : type === 'task' ? 'Buy IC Card' : 'Travel Adapter'}`}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {type === 'activity' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={currentTrip?.startDate} max={currentTrip?.endDate} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none" required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start</label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 text-slate-800 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">End</label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 text-slate-800 outline-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Location / Venue</label>
                <input 
                  type="text" ref={placesRef} value={locationName} 
                  onChange={(e) => { setLocationName(e.target.value); setSelectedCoords(null); }} 
                  placeholder="Search Places..." 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-indigo-500 transition-all" 
                />
              </div>
            </>
          )}

          {type === 'task' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Assign To</label>
                  <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none">
                    <option value="Unassigned">-- Unassigned --</option>
                    {travelersList.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Due Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none" />
                </div>
              </div>
              {isEditMode && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none">
                    <option>Not Started</option><option>In Progress</option><option>Completed</option>
                  </select>
                </div>
              )}
            </>
          )}

          {type === 'document' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Upload File</label>
                <input type="file" onChange={(e) => setDocFile(e.target.files[0])} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 outline-none text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Link to Activity (Optional)</label>
                <select value={linkedActivityID} onChange={(e) => setLinkedActivityID(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none">
                  <option value="">-- None --</option>
                  {activities?.filter(a => a.date === date).map(a => <option key={a.id} value={a.id}>{a.title} ({a.startTime})</option>)}
                </select>
                {activities?.filter(a => a.date === date).length === 0 && <p className="text-[10px] text-slate-400 mt-1">No activities found on {date}.</p>}
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Associated Date</label>
                 <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={currentTrip?.startDate} max={currentTrip?.endDate} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none" />
              </div>
            </>
          )}

          <div className="pt-4 flex gap-3">
            {isEditMode && (
              <button 
                type="button" onClick={handleDelete} disabled={loading}
                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-4 rounded-xl transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center"
              >Delete</button>
            )}
            <button 
              type="submit" disabled={loading}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center ${isEditMode ? 'flex-[2]' : 'w-full'}`}
            >
              {loading ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (isEditMode ? 'Save Changes' : 'Save to Trip')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// ITINERARY SETTINGS MODAL (Daily Locations)
// ==========================================
function DailyLocationsModal({ isOpen, onClose, currentTrip, tripDates, currentUser }) {
  const [localSettings, setLocalSettings] = useState(currentTrip.dailyLocations || {});
  const [saving, setSaving] = useState(false);
  const availableLocations = currentTrip.locations || [];

  const handleUpdateLocation = (dateStr, location) => {
    setLocalSettings(prev => ({ ...prev, [dateStr]: location }));
  };

  const handleSaveSettings = async () => {
    if (!currentUser || !currentTrip) return;
    setSaving(true);
    const basePath = [];
    try {
      await updateDoc(doc(db, ...basePath, 'trips', currentTrip.id), { dailyLocations: localSettings });
      onClose();
    } catch (error) { console.error("Save Settings Error:", error); } 
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[85vh] m-4">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <MapPinned size={18} className="text-indigo-600"/> Assign Daily Locations
          </h2>
          <button onClick={onClose} className="p-2 bg-white text-slate-500 rounded-full hover:bg-slate-200 shadow-sm border border-slate-100"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {tripDates.map((date, idx) => {
            const dateStr = date.toISOString().split('T')[0];
            const displayDate = date.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
            const currentValue = localSettings[dateStr] || '';

            return (
              <div key={dateStr} className="flex items-center justify-between border-b border-slate-50 pb-2">
                <div className="text-sm">
                  <span className="text-slate-400 w-16 inline-block">Day {idx + 1}</span>
                  <span className="font-medium text-slate-700">{displayDate}</span>
                </div>
                <select 
                  value={currentValue}
                  onChange={(e) => handleUpdateLocation(dateStr, e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-2 py-1.5 text-slate-800 outline-none focus:border-indigo-500 max-w-[140px]"
                >
                  <option value="">-- Not Set --</option>
                  {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-slate-100">
          <button 
            onClick={handleSaveSettings} disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-70 flex justify-center items-center"
          >
            {saving ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Save Locations'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ACTIVITY ACTION MODAL (Edit or View Doc)
// ==========================================
function ActivityActionModal({ activity, vaultDocs, onClose, onEdit, onViewDoc }) {
  const linkedDoc = vaultDocs.find(d => d.id === activity.linkedDocID);
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-3 transform transition-all">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg text-slate-800 leading-tight pr-4">{activity.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1"><X size={20} /></button>
        </div>
        <button onClick={onEdit} className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95">
          <Edit2 size={18} className="text-slate-500" /> Edit Activity Details
        </button>
        {linkedDoc && (
          <button onClick={() => onViewDoc(linkedDoc)} className="w-full py-3.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95">
            <FileText size={18} className="text-indigo-500" /> View Attached Document
          </button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// DOCUMENT VIEWER MODAL
// ==========================================
function DocumentViewerModal({ doc, onClose, currentUser }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!currentUser || !window.confirm("Are you sure you want to delete this document?")) return;
    setIsDeleting(true);
    try {
      if (doc.storagePath) await deleteObject(ref(storage, doc.storagePath));
      const basePath = [];
      await deleteDoc(doc(db, ...basePath, 'vault', doc.id));
      onClose();
    } catch (error) { console.error("Error deleting document:", error); setIsDeleting(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center animate-in fade-in p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col transform transition-all slide-in-from-bottom-4">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
          <h3 className="font-bold text-slate-800 truncate pr-4">{doc.fileName}</h3>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={isDeleting} className="p-2 bg-rose-50 text-rose-500 rounded-full hover:bg-rose-100 transition-colors disabled:opacity-50"><Trash2 size={18} /></button>
            <button onClick={onClose} className="p-2 bg-slate-50 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"><X size={18} /></button>
          </div>
        </div>
        
        <div className="p-10 flex flex-col items-center justify-center bg-slate-50 min-h-[250px] relative">
          {doc.type === 'image' && doc.fileUrl !== '#' ? (
            <img src={doc.fileUrl} alt={doc.fileName} className="max-h-48 rounded-lg shadow-sm object-contain" />
          ) : (
            <>
              <FileText size={72} className="text-indigo-200 mb-4" />
              <p className="text-sm text-slate-500 text-center font-medium">Document ready for viewing</p>
            </>
          )}
        </div>
        
        <div className="p-5 border-t border-slate-100 bg-white">
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" download={doc.fileName} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md shadow-indigo-200/50">
            <Download size={20} /> Download File
          </a>
        </div>
      </div>
    </div>
  );
}