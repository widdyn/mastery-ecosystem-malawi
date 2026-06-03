const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const { supabaseAdmin } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

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
