(function() {
  // Apply saved theme immediately in head if inline, but here as early as possible
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Double check theme state
    const isDarkNow = document.documentElement.classList.contains('dark-theme');
    
    // Insert theme toggle dynamically into navbar
    const navContainer = document.querySelector('.nav-container');
    const hamburger = document.getElementById('hamburgerBtn');
    if (navContainer && hamburger) {
      // Create theme toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'theme-toggle-btn';
      toggleBtn.id = 'themeToggleBtn';
      toggleBtn.setAttribute('aria-label', 'Toggle Light/Dark Theme');
      toggleBtn.innerHTML = isDarkNow ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
      
      // Insert before hamburger button
      navContainer.insertBefore(toggleBtn, hamburger);
      
      // Handle click
      toggleBtn.addEventListener('click', () => {
        const currentlyDark = document.documentElement.classList.contains('dark-theme');
        if (currentlyDark) {
          document.documentElement.classList.remove('dark-theme');
          localStorage.setItem('theme', 'light');
          toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
          document.documentElement.classList.add('dark-theme');
          localStorage.setItem('theme', 'dark');
          toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }
      });
    }
    
    // Resolve active navigation links and clean up URLs dynamically
    let currentPath = window.location.pathname.split('/').pop();
    if (!currentPath || currentPath === '') {
      currentPath = 'index.html';
    }
    
    const menuLinks = document.querySelectorAll('.nav-menu a');
    menuLinks.forEach(link => {
      const href = link.getAttribute('href');
      // Normalize href for matching
      const linkPath = href ? href.split('/').pop() : '';
      
      if (linkPath === currentPath || (currentPath === 'index.html' && linkPath === '')) {
        link.classList.add('active-link');
        link.style.color = 'var(--color-accent)';
      } else {
        link.classList.remove('active-link');
        link.style.color = '';
      }
      
      // Set active link for contact page
      if (link.textContent.trim().toLowerCase() === 'contact') {
        if (currentPath === 'contact.html' || href === 'contact.html') {
          link.classList.add('active-link');
        }
      }
    });

    // Auth-aware nav: swap "Sign Up" with user avatar if logged in
    const authUser = localStorage.getItem('auth_user');
    const authLink = document.querySelector('.nav-auth-link');
    if (authLink && authUser) {
      try {
        const user = JSON.parse(authUser);
        const initials = user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        authLink.innerHTML = '<span class="nav-avatar">' + initials + '</span> Profile';
        authLink.setAttribute('href', 'profile.html');
        authLink.classList.add('auth-active');
      } catch (e) {}
    }

    // Add scroll animation observer for elements to show staggered premium entry
    const animElements = document.querySelectorAll(
      '.value-card, .step-card, .pillar-card, .team-card, .audience-card, .story-card, .hub-card, .metric-card, .tier-card, .impact-row > div'
    );
    
    const appearObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('appear');
          appearObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

    animElements.forEach((item, idx) => {
      item.classList.add('stagger-item');
      item.style.transitionDelay = `${(idx % 4) * 75}ms`;
      appearObserver.observe(item);
    });

    // Enhance click interactions on links to have smooth visual feedback
    const interactiveElements = document.querySelectorAll('.btn, .nav-menu a, .social-icons a, .team-social a, .video-icon');
    interactiveElements.forEach(el => {
      el.addEventListener('mousedown', () => {
        el.style.transform = 'scale(0.96) translateY(0)';
      });
      el.addEventListener('mouseup', () => {
        el.style.transform = '';
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  });
})();
