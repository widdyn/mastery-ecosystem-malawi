const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const { supabaseAdmin } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const DISTRICT_COORDS = {
  'Balaka': [-14.9833, 34.9667],
  'Blantyre': [-15.7861, 35.0058],
  'Chikwawa': [-16.0333, 34.8000],
  'Chiradzulu': [-15.5833, 35.1833],
  'Chitipa': [-9.7000, 33.2667],
  'Dedza': [-14.3667, 34.3333],
  'Dowa': [-13.6500, 33.9333],
  'Karonga': [-9.9333, 33.9333],
  'Kasungu': [-13.0333, 33.4833],
  'Likoma': [-12.0667, 34.7333],
  'Lilongwe': [-13.9833, 33.7833],
  'Machinga': [-14.9667, 35.5167],
  'Mangochi': [-14.4667, 35.2667],
  'Mchinji': [-13.8000, 32.9000],
  'Mulanje': [-16.0333, 35.5000],
  'Mwanza': [-15.5833, 34.5167],
  'Mzimba': [-11.9000, 33.6000],
  'Neno': [-15.4000, 34.6500],
  'Nkhata Bay': [-11.6000, 34.3000],
  'Nkhotakota': [-12.9167, 34.3000],
  'Nsanje': [-16.9167, 35.2667],
  'Ntcheu': [-14.8333, 34.6667],
  'Ntchisi': [-13.3667, 33.9167],
  'Phalombe': [-15.8000, 35.6500],
  'Rumphi': [-11.0167, 33.8667],
  'Salima': [-13.7833, 34.4333],
  'Thyolo': [-16.0667, 35.1333],
  'Zomba': [-15.3833, 35.3333]
};

const MALAWI_CENTER = [-13.5, 34.0];

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname));

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ===================== MAP USERS =====================

app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('map_users')
      .select('id, name, email, phone, latitude, longitude')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, phone, latitude, longitude } = req.body;

  if (!name || !email || !phone || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (latitude < -17 || latitude > -9 || longitude < 32 || longitude > 36) {
    return res.status(400).json({ error: 'Coordinates must be inside Malawi' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('map_users')
      .insert({ name, email, phone, latitude, longitude })
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      throw error;
    }

    res.status(201).json({ id: data[0].id, message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// ===================== AUTH =====================

app.post('/api/auth/signup', async (req, res) => {
  const { full_name, email, phone, password, district } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from('auth_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const token = generateToken();

    const { data, error } = await supabaseAdmin
      .from('auth_users')
      .insert({
        full_name,
        email,
        phone: phone || '',
        password_hash,
        district: district || '',
        skills: [],
        badges: []
      })
      .select()
      .single();

    if (error) throw error;

    // Also create a map_users record so the user appears on the map
    const coords = DISTRICT_COORDS[data.district] || MALAWI_CENTER;
    const { error: mapErr } = await supabaseAdmin
      .from('map_users')
      .insert({
        name: data.full_name,
        email: data.email,
        phone: data.phone || '',
        latitude: coords[0],
        longitude: coords[1]
      });

    if (mapErr && mapErr.code !== '23505') {
      console.error('map_users insert warning:', mapErr);
    }

    const user = {
      id: data.id,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone || '',
      district: data.district || '',
      bio: data.bio || '',
      skills: data.skills || [],
      badges: data.badges || [],
      avatar_url: data.avatar_url || '',
      latitude: coords[0],
      longitude: coords[1],
      created_at: data.created_at
    };

    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data: userRow, error } = await supabaseAdmin
      .from('auth_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    if (!userRow) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken();

    // Fetch map location
    const { data: mapData } = await supabaseAdmin
      .from('map_users')
      .select('latitude, longitude')
      .eq('email', email)
      .maybeSingle();

    const user = {
      id: userRow.id,
      full_name: userRow.full_name,
      email: userRow.email,
      phone: userRow.phone || '',
      district: userRow.district || '',
      bio: userRow.bio || '',
      skills: userRow.skills || [],
      badges: userRow.badges || [],
      avatar_url: userRow.avatar_url || '',
      latitude: mapData?.latitude || null,
      longitude: mapData?.longitude || null,
      created_at: userRow.created_at
    };

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Signin failed' });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: userRow, error } = await supabaseAdmin
      .from('auth_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    const { data: mapData } = await supabaseAdmin
      .from('map_users')
      .select('latitude, longitude')
      .eq('email', email)
      .maybeSingle();

    const user = {
      id: userRow.id,
      full_name: userRow.full_name,
      email: userRow.email,
      phone: userRow.phone || '',
      district: userRow.district || '',
      bio: userRow.bio || '',
      skills: userRow.skills || [],
      badges: userRow.badges || [],
      avatar_url: userRow.avatar_url || '',
      latitude: mapData?.latitude || null,
      longitude: mapData?.longitude || null,
      created_at: userRow.created_at
    };

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
});

app.put('/api/auth/profile', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const { full_name, phone, district, bio, skills, badges, avatar_url } = req.body;

  try {
    const updates = {};

    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (district !== undefined) updates.district = district;
    if (bio !== undefined) updates.bio = bio;
    if (skills !== undefined) updates.skills = skills;
    if (badges !== undefined) updates.badges = badges;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { error } = await supabaseAdmin
      .from('auth_users')
      .update(updates)
      .eq('email', email);

    if (error) throw error;
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Update failed' });
  }
});

// ===================== MAP LOCATION (for auth users) =====================

app.get('/api/auth/map-location', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabaseAdmin
      .from('map_users')
      .select('latitude, longitude')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ latitude: null, longitude: null });

    res.json({ latitude: data.latitude, longitude: data.longitude });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load map location' });
  }
});

app.put('/api/auth/map-location', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  if (latitude < -17 || latitude > -9 || longitude < 32 || longitude > 36) {
    return res.status(400).json({ error: 'Coordinates must be inside Malawi' });
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from('map_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from('map_users')
        .update({ latitude, longitude })
        .eq('email', email);
      if (error) throw error;
    } else {
      const { data: userData } = await supabaseAdmin
        .from('auth_users')
        .select('full_name, phone')
        .eq('email', email)
        .single();

      const { error } = await supabaseAdmin
        .from('map_users')
        .insert({
          name: userData.full_name,
          email,
          phone: userData.phone || '',
          latitude,
          longitude
        });
      if (error) throw error;
    }

    res.json({ message: 'Map location updated', latitude, longitude });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update map location' });
  }
});

// ===================== TALENT MAP DATA =====================

app.get('/api/talent', async (req, res) => {
  try {
    const { data: authUsers, error: authErr } = await supabaseAdmin
      .from('auth_users')
      .select('id, full_name, email, phone, district, bio, skills, badges, avatar_url, created_at')
      .order('created_at', { ascending: false });

    if (authErr) throw authErr;

    const { data: mapUsers, error: mapErr } = await supabaseAdmin
      .from('map_users')
      .select('email, latitude, longitude');

    if (mapErr) throw mapErr;

    const mapByEmail = {};
    for (const mu of mapUsers || []) {
      mapByEmail[mu.email] = mu;
    }

    const talent = (authUsers || []).map(u => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone || '',
      district: u.district || '',
      bio: u.bio || '',
      skills: u.skills || [],
      badges: u.badges || [],
      avatar_url: u.avatar_url || '',
      latitude: mapByEmail[u.email]?.latitude || null,
      longitude: mapByEmail[u.email]?.longitude || null,
      created_at: u.created_at
    }));

    res.json(talent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load talent data' });
  }
});

// ===================== LEGACY MAP PROFILE =====================

app.get('/profile/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: user, error } = await supabaseAdmin
      .from('map_users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).send('User not found');

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><title>${user.name} - Profile</title>
      <style>body{font-family:Inter,system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 20px}
      a{color:#1B7C4B}h1{color:#0A2F44}</style>
      </head>
      <body>
        <h1>${user.name}</h1>
        <p>Email: ${user.email}</p>
        <p>Phone: ${user.phone}</p>
        <p>Location: (${user.latitude}, ${user.longitude})</p>
        <a href="/">Back to map</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

// ===================== START =====================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
