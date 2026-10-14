/*
 * Vita home-screen apps.
 * First 3 apps: About Me, CV, and Reviews (Supabase ready).
 * Followed by projects.
 */
window.SK_SUPABASE_CONFIG = {
  // Conecte a sua base de dados do Supabase aqui no futuro:
  url: '', // Ex: 'https://seu-projeto.supabase.co'
  anonKey: '', // Sua chave pública anonKey
  table: 'reviews'
};

window.SK_WORKS = [
  {
    id: 'about-me',
    appType: 'about',
    title: 'About Me',
    meta: 'PROFILE // GUILHERME PUGA',
    description: 'Software developer based in Lisbon, Portugal. Specializing in interactive experiences, front-end engineering, and AI.',
    icon: '/assets/icons/me.png',
    theme: '#2563eb'
  },
  {
    id: 'skills',
    appType: 'skills',
    title: 'Skills',
    meta: 'HARD SKILLS // SOFT SKILLS',
    description: 'Front-end development, React, Three.js, AI integration, Supabase, and responsive design.',
    icon: '/assets/icons/skills.png',
    theme: '#7c3aed',
    link: 'mailto:pugadim123@gmail.com?subject=Pedido%20de%20CV%20-%20Guilherme%20Puga'
  },
  {
    id: 'reviews',
    appType: 'reviews',
    title: 'Reviews',
    meta: 'RECOMMENDATIONS // VERIFIED',
    description: 'Client and peer feedback. Integrated with real-time Supabase database synchronization.',
    icon: '★',
    theme: '#52525b'
  },
  {
    id: 'project-01',
    appType: 'project',
    title: 'Project 01',
    meta: 'WEB APPLICATION / 2026',
    description: 'Interactive web platform with dynamic components and modern responsive interface.',
    icon: '01',
    theme: '#ab8bff'
  },
  {
    id: 'project-02',
    appType: 'project',
    title: 'Project 02',
    meta: 'AI EXPERIENCE / 2026',
    description: 'Intelligent generative AI web application with real-time prompt processing and streaming.',
    icon: '02',
    theme: '#ff9fc8'
  },
  {
    id: 'project-03',
    appType: 'project',
    title: 'Project 03',
    meta: 'FULL-STACK PLATFORM / 2026',
    description: 'Full-stack application featuring serverless backend, real-time database, and authentication.',
    icon: '03',
    theme: '#78d6d1'
  },
  {
    id: 'project-04',
    appType: 'project',
    title: 'Project 04',
    meta: '3D GRAPHICS / 2026',
    description: 'Three.js / WebGL interactive scene with shader materials and responsive camera controls.',
    icon: '04',
    theme: '#ffc279'
  },
  {
    id: 'project-05',
    appType: 'project',
    title: 'Project 05',
    meta: 'CREATIVE DEV / 2026',
    description: 'Minimalist editorial experience with typography-driven layout and smooth parallax motion.',
    icon: '05',
    theme: '#8ed8ae'
  },
  {
    id: 'project-06',
    appType: 'project',
    title: 'Project 06',
    meta: 'MOBILE & WEB / 2026',
    description: 'Cross-platform progressive web application optimized for touch gestures and fast offline loading.',
    icon: '06',
    theme: '#83b6ff'
  },
  {
    id: 'project-07',
    appType: 'project',
    title: 'Project 07',
    meta: 'UI / UX EXPERIMENT / 2026',
    description: 'Experimental user interface exploring retro-futuristic OS design and tangible tactile feedback.',
    icon: '07',
    theme: '#d8a1ff'
  }
];
