const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const { supabaseAdmin } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-generated from malawi_districts.geojson via compute_centroids.js
const DISTRICT_COORDS = {
  "Balaka": [-15.041662322649316, 35.12536196387367],
  "Blantyre": [-15.710858658945142, 34.95193864193644],
  "Chikwawa": [-16.372003417830225, 34.78316986307416],
  "Chiradzulu": [-15.7532209948391, 35.19826040364899],
  "Chitipa": [-9.720456518914098, 33.26525262566429],
  "Dedza": [-14.37394426830616, 34.006288088308125],
  "Dowa": [-13.58431193950937, 33.72425753854994],
  "Karonga": [-10.006958112143508, 33.89092289504664],
  "Kasungu": [-12.960750919433625, 33.451082699263765],
  "Likoma": [-12.04766263144439, 34.694311177837],
  "Lilongwe": [-14.088934824973974, 33.60120269687682],
  "Machinga": [-14.917606984185863, 35.39028230212354],
  "Mangochi": [-14.254412944784907, 35.10528418088066],
  "Mchinji": [-13.808147527230034, 33.09837149748922],
  "Mulanje": [-15.940451177905224, 35.530398883631385],
  "Mwanza": [-15.623386233691845, 34.51627380469349],
  "Mzimba": [-11.819914933149905, 33.67435340420449],
  "Neno": [-15.484448694580523, 34.69478651246905],
  "Nkhata Bay": [-11.62665104275173, 34.05706510791406],
  "Nkhotakota": [-13.061902755166264, 34.170673346876434],
  "Nsanje": [-16.65215413039244, 35.10316809918631],
  "Ntcheu": [-14.79723771205328, 34.63831232887119],
  "Ntchisi": [-13.273441499301935, 33.9906831598024],
  "Phalombe": [-15.726292664543646, 35.61250113327227],
  "Rumphi": [-10.898803825051843, 33.745254919884935],
  "Salima": [-13.68384847413035, 34.37548628757627],
  "Thyolo": [-16.13045848640839, 35.104184428224585],
  "Zomba": [-15.434910281007, 35.30213151191997]
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

    // Enrich with district centroid if exact location missing
    const { data: authData } = await supabaseAdmin
      .from('auth_users')
      .select('email, district');

    const authByEmail = {};
    for (const a of authData || []) {
      authByEmail[a.email] = a.district;
    }

    const enriched = (data || []).map(u => {
      const dist = authByEmail[u.email] || null;
      let lat = u.latitude;
      let lng = u.longitude;
      if ((!lat || !lng) && dist && DISTRICT_COORDS[dist]) {
        lat = DISTRICT_COORDS[dist][0];
        lng = DISTRICT_COORDS[dist][1];
      }
      return { ...u, latitude: lat, longitude: lng, district: dist };
    });

    res.json(enriched);
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

    const talent = (authUsers || []).map(u => {
      const mapRec = mapByEmail[u.email];
      let lat = mapRec?.latitude || null;
      let lng = mapRec?.longitude || null;
      // Fall back to district centroid if no map location set
      if ((!lat || !lng) && u.district && DISTRICT_COORDS[u.district]) {
        lat = DISTRICT_COORDS[u.district][0];
        lng = DISTRICT_COORDS[u.district][1];
      }
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone || '',
        district: u.district || '',
        bio: u.bio || '',
        skills: u.skills || [],
        badges: u.badges || [],
        avatar_url: u.avatar_url || '',
        latitude: lat,
        longitude: lng,
        created_at: u.created_at
      };
    });

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
