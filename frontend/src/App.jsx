import { useEffect, useMemo, useState } from 'react';
import {
  FaBell,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaCogs,
  FaEnvelope,
  FaShieldAlt,
  FaUserMd,
  FaUsers
} from 'react-icons/fa';
import {
  cancelAppointment,
  addProviderAbsence,
  clearSession,
  createAppointment,
  deleteProviderAbsence,
  fetchAdminUsers,
  fetchAppointments,
  fetchAvailability,
  fetchMonthAvailability,
  fetchProviders,
  fetchProfile,
  fetchProviderSchedule,
  getStoredSession,
  login,
  registerUser,
  sendAdminAppointmentReminder,
  storeSession,
  updateAppointment,
  updateProfile,
  updateProviderWorkingHours
} from './api';
import ProviderCard from './components/ProviderCard';

const today = new Date();
const CLINIC_TIME_ZONE = import.meta.env.VITE_CLINIC_TIME_ZONE || 'America/New_York';
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit'
});
const clinicDatePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getNextBusinessDay(date) {
  const nextDate = new Date(date);
  while ([0, 6].includes(nextDate.getDay())) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return nextDate;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function toClinicDateKey(date) {
  const parts = Object.fromEntries(
    clinicDatePartsFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toDateTimeLocalValue(date) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 16);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDays(monthCursor) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function appointmentsForDate(appointments, date) {
  if (!date) return [];
  const dateValue = toDateInputValue(date);
  return appointments.filter((appointment) => toClinicDateKey(new Date(appointment.starts_at)) === dateValue);
}

function isPastAppointment(appointment) {
  return new Date(appointment.ends_at || appointment.starts_at) < new Date();
}

function App() {
  const initialBookingDate = getNextBusinessDay(today);
  const [activeView, setActiveView] = useState('dashboard');
  const [session, setSession] = useState(() => getStoredSession());
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('patient@ortho.test');
  const [password, setPassword] = useState('patient123');
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'patient',
    specialty: 'General Orthopedics',
    location: 'OrthoSchedule Clinic'
  });
  const [providers, setProviders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({});
  const [providerSchedule, setProviderSchedule] = useState({ workingHours: [], absences: [] });
  const [absenceForm, setAbsenceForm] = useState({
    startsAt: toDateTimeLocalValue(initialBookingDate),
    endsAt: toDateTimeLocalValue(new Date(initialBookingDate.getTime() + 60 * 60 * 1000)),
    reason: ''
  });
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminPatientId, setAdminPatientId] = useState('');
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState(null);
  const [monthAvailability, setMonthAvailability] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(initialBookingDate));
  const [monthCursor, setMonthCursor] = useState(new Date(initialBookingDate.getFullYear(), initialBookingDate.getMonth(), 1));
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('New orthopedic consultation');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const upcomingAppointment = appointments.find(
    (appointment) => appointment.status === 'booked' && !isPastAppointment(appointment)
  );
  const monthDays = useMemo(() => getMonthDays(monthCursor), [monthCursor]);
  const providerCalendarDays = useMemo(
    () => monthDays.map((date) => ({ date, appointments: appointmentsForDate(appointments, date) })),
    [appointments, monthDays]
  );
  const isProvider = session?.user?.role === 'provider';
  const isAdmin = session?.user?.role === 'administrator';
  const patientUsers = adminUsers.filter((user) => user.role === 'patient');
  const unavailableDates = new Set(monthAvailability.filter((day) => !day.available).map((day) => day.date));
  const userName = session?.user?.name || 'Guest';
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!session) return;

    async function loadDashboard() {
      try {
        setError('');
        const [providerData, appointmentData, profileData, adminData, scheduleData] = await Promise.all([
          fetchProviders(),
          fetchAppointments(),
          fetchProfile(),
          session.user.role === 'administrator' ? fetchAdminUsers() : Promise.resolve(null),
          session.user.role === 'provider' ? fetchProviderSchedule() : Promise.resolve(null)
        ]);
        setProviders(providerData.providers);
        setAppointments(appointmentData.appointments);
        setProfile(profileData.profile);
        setProfileForm({
          name: profileData.profile.user?.name || '',
          phone: profileData.profile.user?.phone || '',
          specialty: profileData.profile.provider?.specialty || '',
          location: profileData.profile.provider?.location || '',
          bio: profileData.profile.provider?.bio || '',
          education: profileData.profile.provider?.education || '',
          yearsExperience: profileData.profile.provider?.years_experience || 0
        });
        if (adminData?.users) {
          setAdminUsers(adminData.users);
          setAdminPatientId((current) => current || adminData.users.find((user) => user.role === 'patient')?.id || '');
        }
        if (scheduleData?.workingHours) {
          setProviderSchedule(scheduleData);
        }
        setSelectedProviderId((current) => current || providerData.providers[0]?.id || null);
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    loadDashboard();
  }, [session]);

  useEffect(() => {
    if (!session || !selectedProviderId || !selectedDate) return;

    async function loadSlots() {
      try {
        setError('');
        const data = await fetchAvailability(selectedProviderId, selectedDate);
        setSlots(data.slots);
        setSelectedSlot(data.slots[0]?.startsAt || null);
      } catch (requestError) {
        setSlots([]);
        setSelectedSlot(null);
        setError(requestError.message);
      }
    }

    loadSlots();
  }, [session, selectedProviderId, selectedDate]);

  useEffect(() => {
    if (!session || !selectedProviderId) return;

    async function loadMonthAvailability() {
      try {
        const data = await fetchMonthAvailability(selectedProviderId, monthKey(monthCursor));
        setMonthAvailability(data.days);
      } catch {
        setMonthAvailability([]);
      }
    }

    loadMonthAvailability();
  }, [session, selectedProviderId, monthCursor]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const nextSession = await login(email, password);
      storeSession(nextSession);
      setSession(nextSession);
      setStatusMessage(`Signed in as ${nextSession.user.name}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        name: registerForm.name,
        email: registerForm.email,
        password: registerForm.password,
        role: registerForm.role,
        ...(registerForm.role === 'provider'
          ? { specialty: registerForm.specialty, location: registerForm.location }
          : {})
      };
      const nextSession = await registerUser(payload);
      storeSession(nextSession);
      setSession(nextSession);
      setActiveView('dashboard');
      setStatusMessage(`Registered and signed in as ${nextSession.user.name}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBookAppointment() {
    if (!selectedProviderId || !selectedSlot) return;
    setLoading(true);
    setError('');

    try {
      await createAppointment(selectedProviderId, selectedSlot, reason);
      const [appointmentData, slotData] = await Promise.all([
        fetchAppointments(),
        fetchAvailability(selectedProviderId, selectedDate)
      ]);
      setAppointments(appointmentData.appointments);
      setSlots(slotData.slots);
      setSelectedSlot(slotData.slots[0]?.startsAt || null);
      setStatusMessage('Appointment booked successfully.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelAppointment(id) {
    setLoading(true);
    setError('');

    try {
      await cancelAppointment(id);
      const [appointmentData, slotData] = await Promise.all([
        fetchAppointments(),
        selectedProviderId ? fetchAvailability(selectedProviderId, selectedDate) : Promise.resolve({ slots: [] })
      ]);
      setAppointments(appointmentData.appointments);
      setSlots(slotData.slots);
      setSelectedSlot(slotData.slots[0]?.startsAt || null);
      setStatusMessage('Appointment cancelled.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadAppointmentsAndSlots() {
    const appointmentData = await fetchAppointments();
    setAppointments(appointmentData.appointments);
    if (selectedProviderId) {
      const [slotData, monthData] = await Promise.all([
        fetchAvailability(selectedProviderId, selectedDate),
        fetchMonthAvailability(selectedProviderId, monthKey(monthCursor))
      ]);
      setSlots(slotData.slots);
      setSelectedSlot(slotData.slots[0]?.startsAt || null);
      setMonthAvailability(monthData.days);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await updateProfile(profileForm);
      setProfile(data.profile);
      const nextSession = { ...session, user: { ...session.user, name: data.profile.user.name } };
      storeSession(nextSession);
      setSession(nextSession);
      setStatusMessage('Profile updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveWorkingHours(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const workingHours = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
        const existing = providerSchedule.workingHours.find((hours) => Number(hours.day_of_week) === dayOfWeek);
        return {
          dayOfWeek,
          enabled: Boolean(existing),
          startTime: existing?.start_time?.slice(0, 5) || '08:00',
          endTime: existing?.end_time?.slice(0, 5) || '16:30'
        };
      });
      const data = await updateProviderWorkingHours(workingHours);
      setProviderSchedule((current) => ({ ...current, workingHours: data.workingHours }));
      setStatusMessage('Working schedule updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAbsence(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await addProviderAbsence({
        startsAt: new Date(absenceForm.startsAt).toISOString(),
        endsAt: new Date(absenceForm.endsAt).toISOString(),
        reason: absenceForm.reason
      });
      const scheduleData = await fetchProviderSchedule();
      setProviderSchedule(scheduleData);
      setStatusMessage('Absence time added.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAbsence(id) {
    setLoading(true);
    setError('');

    try {
      await deleteProviderAbsence(id);
      const scheduleData = await fetchProviderSchedule();
      setProviderSchedule(scheduleData);
      setStatusMessage('Absence time removed.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRescheduleAppointment(id) {
    if (!selectedSlot) return;
    setLoading(true);
    setError('');

    try {
      await updateAppointment(id, { startsAt: selectedSlot });
      await reloadAppointmentsAndSlots();
      setRescheduleAppointmentId(null);
      setStatusMessage('Appointment rescheduled.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminBookAppointment() {
    if (!selectedProviderId || !selectedSlot || !adminPatientId) return;
    setLoading(true);
    setError('');

    try {
      await createAppointment(selectedProviderId, selectedSlot, reason, adminPatientId);
      await reloadAppointmentsAndSlots();
      setStatusMessage('Admin appointment booked.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReminder(id) {
    setLoading(true);
    setError('');

    try {
      await sendAdminAppointmentReminder(id);
      await reloadAppointmentsAndSlots();
      setStatusMessage('Reminder email sent.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setAppointments([]);
    setProviders([]);
    setSlots([]);
    setSelectedProviderId(null);
    setStatusMessage('');
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FaCalendarAlt },
    ...(!isProvider ? [{ id: 'book', label: 'Book Appointment', icon: FaUserMd }] : []),
    { id: 'appointments', label: isAdmin ? 'Manage Appointment' : 'My Appointments', icon: FaBell },
    ...(session ? [{ id: 'profile', label: 'Profile', icon: FaUserMd }] : []),
    ...(isProvider ? [{ id: 'schedule', label: 'Work Schedule', icon: FaCalendarAlt }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: FaShieldAlt }] : []),
    { id: 'providers', label: 'Providers', icon: FaUsers },
    { id: 'messages', label: 'Messages', icon: FaEnvelope },
    { id: 'security', label: 'Security', icon: FaShieldAlt },
    { id: 'settings', label: 'Settings', icon: FaCogs }
  ];

  const showDashboard = activeView === 'dashboard';
  const showProviders = !isProvider && (showDashboard || activeView === 'providers' || activeView === 'book' || activeView === 'admin');
  const showBooking = !isProvider && (showDashboard || activeView === 'book' || activeView === 'admin');
  const showAppointments = showDashboard || activeView === 'appointments';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-circle">OS</div>
          <div>
            <h1>OrthoSchedule</h1>
            <p>Orthopedic Care, Simplified</p>
          </div>
        </div>

        <nav className="nav-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                onClick={() => setActiveView(item.id)}
              >
                <Icon /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <h3>Need Help?</h3>
          <p>Our support team is here to help you.</p>
          <button className="secondary-button">Contact Support</button>
        </div>
      </aside>

      <main className="workspace">
        <div className="content-wrapper">
          <div className="header-section">
            <div className="header-content">
              <div>
                <p className="eyebrow">Welcome back, {userName}.</p>
                <h1>Book your next appointment with ease.</h1>
              </div>
              <div className="profile-actions">
                <div className="profile-pill">
                  <span>{initials || 'OS'}</span>
                  <div className="profile-name">{session ? userName : 'Not signed in'}</div>
                </div>
                {session && (
                  <button className="secondary-button" onClick={handleLogout}>
                    Sign out
                  </button>
                )}
              </div>
            </div>
          </div>

          {!session && (
            <section className="section auth-section">
              <div>
                <h2>{authMode === 'login' ? 'Sign in' : 'Create account'}</h2>
                <p className="section-subtitle">Patients can book visits. Providers can view their appointment calendar.</p>
                <div className="auth-toggle">
                  <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
                  <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
                </div>
                <div className="demo-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEmail('patient@ortho.test');
                      setPassword('patient123');
                      setAuthMode('login');
                    }}
                  >
                    Use patient demo
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEmail('anderson@ortho.test');
                      setPassword('provider123');
                      setAuthMode('login');
                    }}
                  >
                    Use provider demo
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEmail('admin@ortho.test');
                      setPassword('admin123');
                      setAuthMode('login');
                    }}
                  >
                    Use admin demo
                  </button>
                </div>
              </div>
              {authMode === 'login' ? (
                <form className="auth-form" onSubmit={handleLogin}>
                  <label>
                    Email
                    <input value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <label>
                    Password
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </label>
                  <button className="primary-button" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleRegister}>
                  <label>
                    Full name
                    <input
                      value={registerForm.name}
                      onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      value={registerForm.email}
                      onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                    />
                  </label>
                  <label>
                    Account type
                    <select
                      value={registerForm.role}
                      onChange={(event) => setRegisterForm({ ...registerForm, role: event.target.value })}
                    >
                      <option value="patient">Patient</option>
                      <option value="provider">Provider</option>
                    </select>
                  </label>
                  {registerForm.role === 'provider' && (
                    <>
                      <label>
                        Specialty
                        <input
                          value={registerForm.specialty}
                          onChange={(event) => setRegisterForm({ ...registerForm, specialty: event.target.value })}
                        />
                      </label>
                      <label>
                        Clinic location
                        <input
                          value={registerForm.location}
                          onChange={(event) => setRegisterForm({ ...registerForm, location: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                  <button className="primary-button" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                  </button>
                </form>
              )}
            </section>
          )}

          {(error || statusMessage) && <div className={`notice ${error ? 'error' : 'success'}`}>{error || statusMessage}</div>}

          {showProviders && <section className="section">
            <div className="section-header">
              <div>
                <h2>Find a Provider</h2>
                <p>Search by name or specialty</p>
              </div>
            </div>
            <div className="provider-grid">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  selected={provider.id === selectedProviderId}
                  onSelect={() => setSelectedProviderId(provider.id)}
                />
              ))}
              {session && providers.length === 0 && <p className="empty-state">No providers found.</p>}
              {!session && <p className="empty-state">Sign in to load providers from the API.</p>}
            </div>
          </section>}

          {showBooking && <section className="section">
            <h2>Book an Appointment</h2>
            <p className="section-subtitle">Select a provider, date, and open time slot.</p>

            <div className="booking-layout">
              <div className="calendar-section">
                <div className="calendar-nav">
                  <button
                    className="nav-btn"
                    onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                  >
                    <FaChevronLeft />
                  </button>
                  <span className="month-display">
                    {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthCursor)}
                  </span>
                  <button
                    className="nav-btn"
                    onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                  >
                    <FaChevronRight />
                  </button>
                </div>

                <div className="calendar-weekdays">
                  <div>SUN</div>
                  <div>MON</div>
                  <div>TUE</div>
                  <div>WED</div>
                  <div>THU</div>
                  <div>FRI</div>
                  <div>SAT</div>
                </div>

                <div className="calendar-grid">
                  {monthDays.map((date, idx) => {
                    const dayValue = date ? toDateInputValue(date) : null;
                    const unavailable = Boolean(dayValue && unavailableDates.has(dayValue));
                    return (
                      <button
                        key={idx}
                        className={`calendar-day ${dayValue === selectedDate ? 'selected' : ''} ${!date ? 'empty' : ''} ${unavailable ? 'unavailable' : ''}`}
                        disabled={!date || unavailable}
                        onClick={() => date && !unavailable && setSelectedDate(dayValue)}
                      >
                        {date?.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="timeslots-section">
                <div className="provider-display">
                  <h3>{selectedProvider?.name || 'Select a provider'}</h3>
                  <p>{selectedProvider?.specialty || 'Availability will appear here.'}</p>
                </div>

                <div className="timeslots-grid">
                  {slots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      className={`timeslot ${slot.startsAt === selectedSlot ? 'selected' : ''}`}
                      onClick={() => setSelectedSlot(slot.startsAt)}
                    >
                      {slot.label}
                    </button>
                  ))}
                  {session && slots.length === 0 && <p className="empty-state">No available slots for this date.</p>}
                </div>

                <label className="reason-field">
                  Visit reason
                  <input value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>

                {isAdmin && (
                  <label className="reason-field">
                    Patient
                    <select value={adminPatientId} onChange={(event) => setAdminPatientId(event.target.value)}>
                      {patientUsers.map((patient) => (
                        <option value={patient.id} key={patient.id}>{patient.name} ({patient.email})</option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  className="primary-button"
                  disabled={!session || !selectedSlot || loading || (!rescheduleAppointmentId && isAdmin && !adminPatientId)}
                  onClick={
                    rescheduleAppointmentId
                      ? () => handleRescheduleAppointment(rescheduleAppointmentId)
                      : isAdmin
                        ? handleAdminBookAppointment
                        : handleBookAppointment
                  }
                >
                  {loading ? 'Working...' : rescheduleAppointmentId ? 'Confirm Reschedule' : isAdmin ? 'Book for Patient' : 'Book Appointment'}
                </button>
                {rescheduleAppointmentId && (
                  <button className="secondary-button" onClick={() => setRescheduleAppointmentId(null)}>
                    Cancel Reschedule
                  </button>
                )}
              </div>
            </div>
          </section>}

          {activeView === 'profile' && session && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>Profile</h2>
                  <p>Edit contact and role-specific details.</p>
                </div>
              </div>
              <form className="auth-form profile-form" onSubmit={handleSaveProfile}>
                <label>
                  Full name
                  <input value={profileForm.name || ''} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} />
                </label>
                <label>
                  Phone
                  <input value={profileForm.phone || ''} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} />
                </label>
                {isProvider && (
                  <>
                    <label>
                      Specialty
                      <input value={profileForm.specialty || ''} onChange={(event) => setProfileForm({ ...profileForm, specialty: event.target.value })} />
                    </label>
                    <label>
                      Clinic location
                      <input value={profileForm.location || ''} onChange={(event) => setProfileForm({ ...profileForm, location: event.target.value })} />
                    </label>
                    <label>
                      Education
                      <input value={profileForm.education || ''} onChange={(event) => setProfileForm({ ...profileForm, education: event.target.value })} />
                    </label>
                    <label>
                      Years experience
                      <input
                        type="number"
                        min="0"
                        value={profileForm.yearsExperience || 0}
                        onChange={(event) => setProfileForm({ ...profileForm, yearsExperience: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Bio
                      <textarea value={profileForm.bio || ''} onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })} />
                    </label>
                  </>
                )}
                <button className="primary-button" disabled={loading}>{loading ? 'Saving...' : 'Save Profile'}</button>
              </form>
            </section>
          )}

          {activeView === 'schedule' && isProvider && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>Work Schedule</h2>
                  <p>Mark workdays and absence time slots.</p>
                </div>
              </div>
              <form className="schedule-list" onSubmit={handleSaveWorkingHours}>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayName, dayOfWeek) => {
                  const hours = providerSchedule.workingHours.find((item) => Number(item.day_of_week) === dayOfWeek);
                  return (
                    <div className="schedule-row" key={dayName}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={Boolean(hours)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setProviderSchedule((current) => ({
                                ...current,
                                workingHours: [...current.workingHours, { day_of_week: dayOfWeek, start_time: '08:00', end_time: '16:30' }]
                              }));
                            } else {
                              setProviderSchedule((current) => ({
                                ...current,
                                workingHours: current.workingHours.filter((item) => Number(item.day_of_week) !== dayOfWeek)
                              }));
                            }
                          }}
                        />
                        {dayName}
                      </label>
                      <input
                        type="time"
                        disabled={!hours}
                        value={hours?.start_time?.slice(0, 5) || '08:00'}
                        onChange={(event) => setProviderSchedule((current) => ({
                          ...current,
                          workingHours: current.workingHours.map((item) => Number(item.day_of_week) === dayOfWeek ? { ...item, start_time: event.target.value } : item)
                        }))}
                      />
                      <input
                        type="time"
                        disabled={!hours}
                        value={hours?.end_time?.slice(0, 5) || '16:30'}
                        onChange={(event) => setProviderSchedule((current) => ({
                          ...current,
                          workingHours: current.workingHours.map((item) => Number(item.day_of_week) === dayOfWeek ? { ...item, end_time: event.target.value } : item)
                        }))}
                      />
                    </div>
                  );
                })}
                <button className="primary-button" disabled={loading}>Save Working Hours</button>
              </form>

              <form className="auth-form absence-form" onSubmit={handleAddAbsence}>
                <h3>Add Absence</h3>
                <label>
                  Starts
                  <input type="datetime-local" value={absenceForm.startsAt} onChange={(event) => setAbsenceForm({ ...absenceForm, startsAt: event.target.value })} />
                </label>
                <label>
                  Ends
                  <input type="datetime-local" value={absenceForm.endsAt} onChange={(event) => setAbsenceForm({ ...absenceForm, endsAt: event.target.value })} />
                </label>
                <label>
                  Reason
                  <input value={absenceForm.reason} onChange={(event) => setAbsenceForm({ ...absenceForm, reason: event.target.value })} />
                </label>
                <button className="primary-button" disabled={loading}>Add Absence</button>
              </form>

              <div className="appointment-list">
                {providerSchedule.absences.map((absence) => (
                  <div className="appointment-row" key={absence.id}>
                    <div>
                      <h3>{absence.reason || 'Unavailable'}</h3>
                      <p>{dateFormatter.format(new Date(absence.starts_at))}</p>
                      <span>{timeFormatter.format(new Date(absence.starts_at))} to {timeFormatter.format(new Date(absence.ends_at))}</span>
                    </div>
                    <button className="link-button" onClick={() => handleDeleteAbsence(absence.id)}>Remove</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeView === 'admin' && isAdmin && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>Admin Schedule Management</h2>
                  <p>Review all patient and provider appointments, then cancel appointments when needed.</p>
                </div>
              </div>
              <div className="appointment-list">
                {appointments.map((appointment) => (
                  <div className={`appointment-row ${isPastAppointment(appointment) ? 'past' : ''}`} key={appointment.id}>
                    <div>
                      <h3>{appointment.patient_name} with {appointment.provider_name}</h3>
                      <p>{appointment.reason || appointment.specialty}</p>
                      <span>{dateFormatter.format(new Date(appointment.starts_at))} at {timeFormatter.format(new Date(appointment.starts_at))}</span>
                    </div>
                    <div className="row-actions">
                      <div className={`status-pill ${appointment.status}`}>{appointment.status}</div>
                      {appointment.status === 'booked' && !isPastAppointment(appointment) && (
                        <>
                          <button
                            className="link-button"
                            disabled={loading}
                            onClick={() => {
                              setSelectedProviderId(appointment.provider_id);
                              setRescheduleAppointmentId(appointment.id);
                              setActiveView('admin');
                            }}
                          >
                            Reschedule
                          </button>
                          <button className="link-button" disabled={loading} onClick={() => handleCancelAppointment(appointment.id)}>
                            Cancel
                          </button>
                          <button className="link-button" disabled={loading} onClick={() => handleSendReminder(appointment.id)}>
                            Send Reminder
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showAppointments && <section className="section">
            <div className="summary-cards">
              <div className="card">
                <h3>{isProvider ? 'Next Patient' : 'Upcoming Appointment'}</h3>
                {upcomingAppointment ? (
                  <>
                    <p className="date-time">
                      {dateFormatter.format(new Date(upcomingAppointment.starts_at))} at{' '}
                      {timeFormatter.format(new Date(upcomingAppointment.starts_at))}
                    </p>
                    <p className="doctor-name">{isProvider ? upcomingAppointment.patient_name : upcomingAppointment.provider_name}</p>
                    <p className="location">{upcomingAppointment.location}</p>
                    {!isProvider && (
                      <button className="link-button" disabled={loading} onClick={() => handleCancelAppointment(upcomingAppointment.id)}>
                        Cancel Appointment
                      </button>
                    )}
                  </>
                ) : (
                  <p>{isProvider ? 'No patient appointments yet.' : 'No upcoming appointment yet.'}</p>
                )}
              </div>

              <div className="card">
                <h3>Health Tips</h3>
                <p>Strengthen your bones with a balanced diet and regular exercise.</p>
                <button className="link-button">Learn More</button>
              </div>

              <div className="card">
                <h3>Need Assistance?</h3>
                <p>Our support team is available to help you with any questions.</p>
                <button className="link-button">Contact Support</button>
              </div>
            </div>
          </section>}

          {isProvider && (showDashboard || activeView === 'appointments') && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>Provider Calendar</h2>
                  <p>All booked patient appointments for the selected month.</p>
                </div>
              </div>
              <div className="calendar-section provider-calendar">
                <div className="calendar-nav">
                  <button
                    className="nav-btn"
                    onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                  >
                    <FaChevronLeft />
                  </button>
                  <span className="month-display">
                    {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthCursor)}
                  </span>
                  <button
                    className="nav-btn"
                    onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                  >
                    <FaChevronRight />
                  </button>
                </div>
                <div className="calendar-weekdays">
                  <div>SUN</div>
                  <div>MON</div>
                  <div>TUE</div>
                  <div>WED</div>
                  <div>THU</div>
                  <div>FRI</div>
                  <div>SAT</div>
                </div>
                <div className="provider-calendar-grid">
                  {providerCalendarDays.map(({ date, appointments: dayAppointments }, idx) => (
                    <div className={`provider-calendar-day ${!date ? 'empty' : ''}`} key={idx}>
                      <span>{date?.getDate()}</span>
                      {dayAppointments.slice(0, 3).map((appointment) => (
                        <div className="calendar-appointment" key={appointment.id}>
                          {timeFormatter.format(new Date(appointment.starts_at))} {appointment.patient_name}
                        </div>
                      ))}
                      {dayAppointments.length > 3 && <div className="calendar-more">+{dayAppointments.length - 3} more</div>}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeView === 'appointments' && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>{isAdmin ? 'Manage Appointments' : 'Appointment History'}</h2>
                  <p>{isAdmin ? 'Book, reschedule, or cancel patient appointments.' : 'Booked, cancelled, and completed visits from PostgreSQL.'}</p>
                </div>
              </div>
              <div className="appointment-list">
                {appointments.map((appointment) => (
                  <div className={`appointment-row ${isPastAppointment(appointment) ? 'past' : ''}`} key={appointment.id}>
                    <div>
                      <h3>{isProvider || isAdmin ? appointment.patient_name : appointment.provider_name}</h3>
                      <p>{isProvider || isAdmin ? `${appointment.provider_name} - ${appointment.reason || 'Patient visit'}` : appointment.specialty}</p>
                      <span>{dateFormatter.format(new Date(appointment.starts_at))} at {timeFormatter.format(new Date(appointment.starts_at))}</span>
                    </div>
                    <div className="row-actions">
                      <div className={`status-pill ${appointment.status}`}>{appointment.status}</div>
                      {!isProvider && appointment.status === 'booked' && !isPastAppointment(appointment) && (
                        <>
                        <button
                          className="link-button"
                          onClick={() => {
                            setSelectedProviderId(appointment.provider_id);
                            setRescheduleAppointmentId(appointment.id);
                            setActiveView(isAdmin ? 'admin' : 'book');
                          }}
                        >
                          Reschedule
                        </button>
                        <button className="link-button" disabled={loading} onClick={() => handleCancelAppointment(appointment.id)}>
                          Cancel
                        </button>
                        {isAdmin && (
                          <button className="link-button" disabled={loading} onClick={() => handleSendReminder(appointment.id)}>
                            Send Reminder
                          </button>
                        )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {session && appointments.length === 0 && <p className="empty-state">No appointments yet.</p>}
                {!session && <p className="empty-state">Sign in to view your appointments.</p>}
              </div>
            </section>
          )}

          {activeView === 'messages' && (
            <section className="section">
              <h2>Messages</h2>
              <p className="section-subtitle">Messaging is ready for the next backend module.</p>
              <div className="placeholder-panel">
                <FaEnvelope />
                <div>
                  <h3>No messages yet</h3>
                  <p>Appointment confirmations and clinic replies can appear here once messaging endpoints are added.</p>
                </div>
              </div>
            </section>
          )}

          {activeView === 'security' && (
            <section className="section">
              <h2>Security</h2>
              <p className="section-subtitle">Current session and role-based access status.</p>
              <div className="settings-list">
                <div><span>Signed in user</span><strong>{session?.user?.email || 'Not signed in'}</strong></div>
                <div><span>Role</span><strong>{session?.user?.role || 'Guest'}</strong></div>
                <div><span>Auth method</span><strong>JWT bearer token</strong></div>
              </div>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="section">
              <h2>Settings</h2>
              <p className="section-subtitle">Local development connection settings.</p>
              <div className="settings-list">
                <div><span>API server</span><strong>http://localhost:4000/api</strong></div>
                <div><span>Database</span><strong>PostgreSQL via Docker</strong></div>
                <div><span>Reminder emails</span><strong>Disabled in local .env</strong></div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
