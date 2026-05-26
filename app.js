import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Firebase Config ---
let firebaseConfig, appId;
if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
} else {
    firebaseConfig = { apiKey: "mock", projectId: "mock" };
    appId = 'musicoul-1';
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = 'chandrashekharkolhe7@gmail.com';
const RAZORPAY_KEY_ID = 'rzp_live_StCBryEj0YbSmn';

// --- State Management ---
let state = {
    currentPage: 'home',
    user: null,
    cartCount: 0,
    mobileMenuOpen: false,
    isLoginMode: true,
    filters: { search: '', type: 'All', category: 'All' },
    dynamicCourses: [],
    adminTab: 'dashboard',
    editingCourse: null,
    allUsers: [],
    userBookings: {},
    editingCourseMaterials: [],
    assignTargetUserId: null,
    assignTargetUserEmail: null,
    currentClassroomCourseId: null,
    activeClassroomNodeId: null
};

// --- Mock Fallback Data ---
const DATA = {
    featuredCourse: { id: 'f1', title: "The Art of Vocal Agility", description: "Master complex vocal runs, breathing techniques, and stage presence.", image: "https://images.unsplash.com/photo-1516280440503-6c9fa5ceec4e?auto=format&fit=crop&q=90&w=1600", type: "Masterclass" },
    libraryCategories: [ { title: "Trending Masterclasses", items: [ { id: 1, title: "Acoustic Fingerpicking", duration: "2h 15m", image: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&q=80&w=800" }, { id: 2, title: "Studio Mixing Secrets", duration: "4h 30m", image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=80&w=800" } ] } ],
    classesData: [ { id: "1", title: "Private Vocal Coaching", type: "Online", location: "Global", category: "Singing", price: "₹2500", period: "/ month", desc: "1-on-1 personalized sessions.", features: ["Pitch correction", "Breath control"], facultyName: "Sarah Jenkins", schedule: [{day: 'Monday', time: '18:00', type: 'Teaching Class'}], materials: [{ id: "root-fold-1", type: "folder", title: "Phase 1: Foundation", sequence: 1, children: [{ id: "f-vid-1", type: "file", fileType: "Video", title: "Breathing Basics", sequence: 1, url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" }]}] } ],
    storeItems: [ { id: 1, name: "Pro Studio Headphones", price: "$199", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=800" } ]
};

// --- Core UI Functions ---
const initLanguageSelects = () => {
    const match = document.cookie.match(/googtrans=\/en\/([a-z]{2})/);
    const lang = match ? match[1] : 'en';
    const dSelect = document.getElementById('desktop-lang-select');
    const mSelect = document.getElementById('mobile-lang-select');
    if (dSelect) dSelect.value = lang; if (mSelect) mSelect.value = lang;
};

window.changeLanguage = (lang) => {
    const select = document.querySelector('.goog-te-combo');
    if (select) { select.value = lang; select.dispatchEvent(new Event('change')); } 
    else { document.cookie = `googtrans=/en/${lang}; path=/; domain=${window.location.hostname}`; document.cookie = `googtrans=/en/${lang}; path=/`; window.location.reload(); }
};

let toastTimeout;
window.showToast = (msg, isError = false) => {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    document.getElementById('toast-message').innerHTML = msg;
    if(isError) { icon.setAttribute('data-lucide', 'alert-circle'); toast.querySelector('.glass-panel').classList.add('border-red-500/50'); } 
    else { icon.setAttribute('data-lucide', 'check-circle-2'); toast.querySelector('.glass-panel').classList.remove('border-red-500/50'); }
    lucide.createIcons();
    toast.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none'); toast.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => window.closeToast(), isError ? 8000 : 4000);
};
window.closeToast = () => document.getElementById('toast').classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');

window.openAuthModal = () => { window.closeMobileMenu(); document.getElementById('auth-modal').classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('auth-modal-content').classList.remove('scale-95'); };
window.closeAuthModal = () => { document.getElementById('auth-modal').classList.add('opacity-0', 'pointer-events-none'); document.getElementById('auth-modal-content').classList.add('scale-95'); };
window.toggleAuthMode = () => {
    state.isLoginMode = !state.isLoginMode;
    document.getElementById('auth-title').innerText = state.isLoginMode ? 'Welcome Back' : 'Join Musicoul';
    document.getElementById('auth-submit-btn').innerText = state.isLoginMode ? 'Sign In' : 'Create Account';
    document.getElementById('auth-toggle-btn').innerHTML = state.isLoginMode ? `Don't have an account? <span class="text-white font-bold border-b border-red-600 pb-0.5 ml-1">Sign Up</span>` : `Already have an account? <span class="text-white font-bold border-b border-red-600 pb-0.5 ml-1">Sign In</span>`;
};

// --- Firebase Auth & Live Subscriptions ---
let unsubCourses, unsubUsers, unsubBookings, unsubCart;

const syncCoursesState = (cloudList = []) => {
    state.dynamicCourses = cloudList.length === 0 ? [...DATA.classesData] : cloudList;
    if (state.currentPage === 'classes') renderClassesGrid();
    if (state.currentPage === 'admin') renderApp();
};

const setupStreams = (user) => {
    if (!user) return;
    if (unsubCourses) unsubCourses(); if (unsubUsers) unsubUsers(); if (unsubBookings) unsubBookings(); if (unsubCart) unsubCart();

    unsubCourses = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'courses'), (snapshot) => {
        const cloudCourses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (cloudCourses.length === 0) { DATA.classesData.forEach(async (cls) => { try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', cls.id.toString()), cls); } catch(e) {} }); }
        syncCoursesState(cloudCourses);
    }, (e) => console.error(e));

    unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snapshot) => {
        state.allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (state.currentPage === 'admin' && state.adminTab === 'users') renderApp();
    }, (e) => console.error(e));

    unsubBookings = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), (snapshot) => {
        const tempBookings = {}; snapshot.docs.forEach(doc => { tempBookings[doc.data().courseId || doc.id] = doc.data(); }); state.userBookings = tempBookings;
        if (state.currentPage === 'classes') renderClassesGrid();
    });

    if (!user.isAnonymous) {
        unsubCart = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'cart'), (snapshot) => { state.cartCount = snapshot.size; updateCartBadge(); });
    } else { state.cartCount = 0; updateCartBadge(); }
};

const startApp = async () => {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
    } catch (err) {}

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        state.user = user;
        updateNavbarUI();
        if (!user.isAnonymous) { try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), { email: user.email, lastLogin: new Date().toISOString() }, { merge: true }); } catch(e) {} }
        setupStreams(user);
        if (state.currentPage === 'admin' && user.email !== ADMIN_EMAIL) window.navigate('home');
    });
};
startApp();

window.handleGoogleSignIn = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); window.closeAuthModal(); window.showToast("Welcome!"); } catch (error) { window.showToast(error.message, true); } };
window.handleEmailAuth = async (e) => {
    e.preventDefault(); const email = document.getElementById('auth-email').value; const password = document.getElementById('auth-password').value;
    try {
        if (!state.isLoginMode) { await createUserWithEmailAndPassword(auth, email, password); window.showToast("Account created."); } 
        else { await signInWithEmailAndPassword(auth, email, password); window.showToast("Welcome back!"); }
        window.closeAuthModal(); document.getElementById('auth-form').reset();
    } catch (error) { window.showToast(error.message.replace('Firebase: ', ''), true); }
};
window.handleSignOut = async () => { try { await signOut(auth); await signInAnonymously(auth); window.showToast("Logged out."); } catch (error) { window.showToast("Failed to log out.", true); } };

window.addToCart = async (itemName) => {
    if (!state.user || state.user.isAnonymous) return window.openAuthModal();
    try { await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'cart', Date.now().toString()), { itemName, addedAt: new Date().toISOString() }); window.showToast(`<b>${itemName}</b> added to cart.`); } catch (e) { window.showToast("Network error.", true); }
};

window.bookSession = async (courseId) => {
    if (!state.user || state.user.isAnonymous) return window.openAuthModal();
    const course = state.dynamicCourses.find(c => c.id.toString() === courseId.toString());
    if (!course) return window.showToast("Course not found.", true);
    const numericPrice = parseInt((course.price || "0").replace(/[^0-9]/g, '')) || 0;
    const options = {
        key: RAZORPAY_KEY_ID, amount: numericPrice * 100, currency: "INR", name: "Musicoul Institute", description: course.title,
        handler: async function (response) {
            try {
                await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'bookings', courseId), { courseId: courseId, className: course.title, status: 'paid', paymentId: response.razorpay_payment_id, bookedAt: new Date().toISOString(), userEmail: state.user.email });
                window.showToast(`Payment successful! Welcome to <b>${course.title}</b>.`);
            } catch (e) { window.showToast("Network error.", true); }
        }, prefill: { email: state.user.email }, theme: { color: "#dc2626" }
    };
    new window.Razorpay(options).open();
};

// --- ADMIN CONTROLLERS ---
window.openManageAccessModal = async (targetUserId, targetUserEmail) => {
    state.assignTargetUserId = targetUserId; state.assignTargetUserEmail = targetUserEmail;
    document.getElementById('manage-access-email').innerText = targetUserEmail;
    document.getElementById('manage-access-modal').classList.remove('opacity-0', 'pointer-events-none');
    const listEl = document.getElementById('manage-access-list'); listEl.innerHTML = `<div class="text-center py-10"><i data-lucide="loader-2" class="w-8 h-8 text-red-500 mx-auto animate-spin mb-4"></i></div>`; lucide.createIcons();

    try {
        let targetBookings = {};
        const snapshot = await getDocs(collection(db, 'artifacts', appId, 'users', targetUserId, 'bookings'));
        snapshot.forEach(doc => { targetBookings[doc.id] = true; });
        
        if(state.dynamicCourses.length === 0) { listEl.innerHTML = `<p class="text-gray-500 text-sm text-center">No courses exist.</p>`; return; }
        listEl.innerHTML = state.dynamicCourses.map(course => {
            const hasAccess = targetBookings[course.id.toString()];
            return `<div class="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center gap-4 hover:bg-white/10">
                <div><h4 class="text-white font-medium mb-1">${course.title}</h4><p class="text-xs text-gray-400">${course.price}</p></div>
                <div>${hasAccess ? `<button onclick="window.toggleCourseAccess('${course.id}', false, '${course.title.replace(/'/g, "\\'")}')" class="bg-red-600/20 text-red-500 border border-red-500/30 px-4 py-2 rounded-full text-[10px] font-bold">Revoke Access</button>` : `<button onclick="window.toggleCourseAccess('${course.id}', true, '${course.title.replace(/'/g, "\\'")}')" class="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-full text-[10px] font-bold">Grant Access</button>`}</div>
            </div>`;
        }).join('');
    } catch (err) { listEl.innerHTML = `<p class="text-red-500 text-sm text-center">Failed to fetch data.</p>`; }
};
window.closeManageAccessModal = () => document.getElementById('manage-access-modal').classList.add('opacity-0', 'pointer-events-none');
window.toggleCourseAccess = async (courseId, shouldGrant, courseTitle) => {
    try {
        const docRef = doc(db, 'artifacts', appId, 'users', state.assignTargetUserId, 'bookings', courseId.toString());
        if (shouldGrant) { await setDoc(docRef, { courseId: courseId.toString(), className: courseTitle, status: 'assigned_by_admin', assignedBy: ADMIN_EMAIL, bookedAt: new Date().toISOString() }); window.showToast(`Access Granted.`); } 
        else { await deleteDoc(docRef); window.showToast(`Access Revoked.`); }
        window.openManageAccessModal(state.assignTargetUserId, state.assignTargetUserEmail);
    } catch (err) { window.showToast("Database error.", true); }
};

// --- TREE BUILDER ---
const findAndManipulateNode = (nodes, targetId, action, payload = {}) => {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === targetId) { if (action === 'DELETE') { nodes.splice(i, 1); return true; } else if (action === 'UPDATE') { nodes[i] = { ...nodes[i], ...payload }; return true; } else if (action === 'ADD_CHILD') { if (!nodes[i].children) nodes[i].children = []; nodes[i].children.push(payload); return true; } }
        if (nodes[i].children) { const res = findAndManipulateNode(nodes[i].children, targetId, action, payload); if (res) return true; }
    } return false;
};
window.addRootFolder = () => { state.editingCourseMaterials.push({ id: 'fold_' + Date.now(), type: 'folder', title: 'New Folder', sequence: state.editingCourseMaterials.length + 1, children: [] }); renderAdminMaterialsTree(); };
window.addRootFile = () => { state.editingCourseMaterials.push({ id: 'file_' + Date.now(), type: 'file', fileType: 'PDF', title: 'Document', sequence: state.editingCourseMaterials.length + 1, url: '#' }); renderAdminMaterialsTree(); };
window.addChildToNode = (parentId, childType) => { const newNode = childType === 'folder' ? { id: 'fold_' + Date.now(), type: 'folder', title: 'Sub-Folder', sequence: 1, children: [] } : { id: 'file_' + Date.now(), type: 'file', fileType: 'PDF', title: 'Material', sequence: 1, url: '#' }; findAndManipulateNode(state.editingCourseMaterials, parentId, 'ADD_CHILD', newNode); renderAdminMaterialsTree(); };
window.updateNodeField = (nodeId, field, value) => { const val = (field === 'sequence') ? (parseInt(value) || 1) : value; findAndManipulateNode(state.editingCourseMaterials, nodeId, 'UPDATE', { [field]: val }); };
window.deleteNode = (nodeId) => { findAndManipulateNode(state.editingCourseMaterials, nodeId, 'DELETE'); renderAdminMaterialsTree(); };
window.handleFileUpload = (inputEl, nodeId) => { const file = inputEl.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { window.updateNodeField(nodeId, 'url', e.target.result); renderAdminMaterialsTree(); window.showToast(`File loaded.`); }; reader.readAsDataURL(file); };

const generateMaterialEditorHTML = (nodes, depth = 0) => {
    if (!nodes) return '';
    return [...nodes].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map(node => {
        const isFolder = node.type === 'folder';
        return `<div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3 relative" style="margin-left: ${depth * 20}px">
            <div class="flex justify-between items-center"><span class="text-[10px] bg-red-600/20 text-red-500 px-2 py-0.5 rounded">${node.type}</span> <button onclick="window.deleteNode('${node.id}')" type="button" class="text-red-400 p-1 bg-red-500/10 rounded"><i data-lucide="trash" class="w-3.5 h-3.5"></i></button></div>
            <div class="grid grid-cols-12 gap-3"><div class="col-span-3"><label class="block text-[9px] text-gray-400">Seq</label><input type="number" min="1" value="${node.sequence}" onchange="window.updateNodeField('${node.id}', 'sequence', this.value)" class="w-full bg-black border border-white/10 rounded px-2 py-1 text-white text-xs"></div><div class="col-span-9"><label class="block text-[9px] text-gray-400">Title</label><input type="text" value="${node.title}" onchange="window.updateNodeField('${node.id}', 'title', this.value)" class="w-full bg-black border border-white/10 rounded px-2 py-1 text-white text-xs"></div>${!isFolder ? `<div class="col-span-12"><label class="block text-[9px] text-gray-400">Type</label><select onchange="window.updateNodeField('${node.id}', 'fileType', this.value)" class="w-full bg-black border border-white/10 rounded px-2 py-1 text-white text-xs"><option value="PDF" ${node.fileType==='PDF'?'selected':''}>PDF</option><option value="Video" ${node.fileType==='Video'?'selected':''}>Video</option><option value="Audio" ${node.fileType==='Audio'?'selected':''}>Audio</option><option value="Image" ${node.fileType==='Image'?'selected':''}>Image</option><option value="Notes" ${node.fileType==='Notes'?'selected':''}>Notes</option></select></div><div class="col-span-12 flex gap-2"><input type="text" value="${node.url||''}" placeholder="URL" onchange="window.updateNodeField('${node.id}', 'url', this.value)" class="w-full bg-black border border-white/10 rounded px-2 py-1 text-white text-xs"><label class="cursor-pointer bg-white/10 px-3 py-1 rounded text-xs flex items-center"><i data-lucide="upload" class="w-3 h-3"></i><input type="file" class="hidden" onchange="window.handleFileUpload(this, '${node.id}')"></label></div>` : ''}</div>
            ${isFolder ? `<div class="flex gap-2 pt-2"><button type="button" onclick="window.addChildToNode('${node.id}', 'folder')" class="text-[9px] text-red-400 border border-red-500/20 px-2 py-1 rounded">+ Folder</button><button type="button" onclick="window.addChildToNode('${node.id}', 'file')" class="text-[9px] text-gray-400 border border-white/10 px-2 py-1 rounded">+ File</button></div>` : ''}
            ${node.children ? `<div class="pt-3 border-t border-white/5 space-y-3">${generateMaterialEditorHTML(node.children, depth + 1)}</div>` : ''}
        </div>`;
    }).join('');
};
const renderAdminMaterialsTree = () => { const el = document.getElementById('materials-tree-builder'); if (el) { el.innerHTML = generateMaterialEditorHTML(state.editingCourseMaterials); lucide.createIcons(); } };

// --- CLASSROOM VIEWER ---
window.openClassroom = (courseId) => {
    state.currentClassroomCourseId = courseId;
    const course = state.dynamicCourses.find(c => c.id.toString() === courseId.toString());
    if (!course) return;
    document.getElementById('classroom-course-title').innerText = course.title;
    state.activeClassroomNodeId = null;
    const facImg = document.getElementById('classroom-faculty-img'); const hFacImg = document.getElementById('classroom-header-faculty-img');
    if(course.facultyImage) { facImg.src = course.facultyImage; facImg.style.display='block'; hFacImg.src = course.facultyImage; hFacImg.classList.remove('hidden'); hFacImg.nextElementSibling.classList.add('hidden');} 
    else { facImg.style.display='none'; hFacImg.classList.add('hidden'); hFacImg.nextElementSibling.classList.remove('hidden');}
    document.getElementById('classroom-faculty-name').innerText = course.facultyName || 'Instructor';
    const schedCont = document.getElementById('classroom-schedule-container');
    if (course.schedule && course.schedule.length > 0) schedCont.innerHTML = course.schedule.map(s => `<div class="flex items-center justify-between bg-black/50 border border-white/10 px-3 py-2 rounded-lg text-xs"><span class="text-white">${s.day}, ${s.time}</span><span class="text-[9px] text-gray-500 uppercase">${s.type}</span></div>`).join('');
    else schedCont.innerHTML = '<p class="text-xs text-gray-500 italic">No scheduled sessions.</p>';
    const joinBtn = document.getElementById('classroom-join-btn');
    if (course.liveClassLink) { joinBtn.href = course.liveClassLink; joinBtn.classList.remove('hidden'); joinBtn.classList.add('flex'); } else { joinBtn.classList.add('hidden'); joinBtn.classList.remove('flex'); }
    renderClassroomView();
    document.getElementById('classroom-panel').classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none'); document.body.style.overflow = 'hidden';
};
window.closeClassroom = () => { document.getElementById('classroom-panel').classList.add('translate-y-full', 'opacity-0', 'pointer-events-none'); document.body.style.overflow = ''; const pc = document.getElementById('classroom-preview-pane'); if (pc) pc.innerHTML = ''; };

const generateClassroomSidebarHTML = (nodes) => {
    if (!nodes) return '';
    return [...nodes].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map(node => {
        const isFolder = node.type === 'folder';
        if (isFolder) return `<div class="space-y-1 mt-2"><div class="flex items-center gap-2 text-sm text-white/90 bg-white/5 px-3 py-2 rounded-lg border border-white/5"><i data-lucide="folder" class="w-3.5 h-3.5 text-red-500"></i><span class="font-serif italic truncate">${node.title}</span></div>${node.children ? `<div class="pl-4 border-l border-white/10 space-y-1 ml-2">${generateClassroomSidebarHTML(node.children)}</div>` : ''}</div>`;
        else {
            const icons = { 'PDF':'file-text', 'Audio':'music-4', 'Video':'video', 'Image':'image', 'Notes':'align-left' };
            const isActive = state.activeClassroomNodeId === node.id;
            return `<button onclick="window.launchClassroomMedia('${node.id}')" class="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg transition-all border ${isActive ? 'bg-red-600/10 text-white border-red-500/40 font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'}"><i data-lucide="${icons[node.fileType]||'file'}" class="w-3.5 h-3.5 flex-shrink-0 ${isActive?'text-red-500':'text-gray-500'}"></i><span class="text-xs truncate flex-grow">${node.title}</span></button>`;
        }
    }).join('');
};
const findNodeInTree = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; if (n.children) { const res = findNodeInTree(n.children, id); if (res) return res; } } return null; };
window.launchClassroomMedia = (nodeId) => { state.activeClassroomNodeId = nodeId; renderClassroomView(); };

const renderClassroomView = () => {
    const course = state.dynamicCourses.find(c => c.id.toString() === state.currentClassroomCourseId.toString()); if (!course) return;
    const treeCont = document.getElementById('classroom-tree-container');
    if (treeCont) treeCont.innerHTML = course.materials && course.materials.length > 0 ? generateClassroomSidebarHTML(course.materials) : `<div class="text-center py-6 text-gray-500 text-xs">No files available.</div>`;
    const previewCont = document.getElementById('classroom-preview-pane');
    const activeNode = state.activeClassroomNodeId ? findNodeInTree(course.materials || [], state.activeClassroomNodeId) : null;
    if (activeNode) {
        let html = '';
        if (activeNode.fileType === 'Video') html = `<div class="w-full max-w-5xl space-y-3"><div class="flex justify-between items-center"><h4 class="text-lg md:text-2xl text-white font-serif">${activeNode.title}</h4></div><video src="${activeNode.url}" controls class="w-full aspect-video bg-black rounded-xl border border-white/10"></video></div>`;
        else if (activeNode.fileType === 'Audio') html = `<div class="w-full max-w-2xl"><div class="glass-panel p-8 rounded-3xl text-center"><div class="w-20 h-20 rounded-full bg-red-600/20 text-red-500 mx-auto mb-6 flex items-center justify-center"><i data-lucide="music-4" class="w-10 h-10"></i></div><h4 class="text-xl text-white font-serif mb-6">${activeNode.title}</h4><audio src="${activeNode.url}" controls class="w-full outline-none"></audio></div></div>`;
        else if (activeNode.fileType === 'PDF') html = `<div class="w-full h-full flex flex-col max-w-5xl"><div class="flex justify-between items-center mb-3"><h4 class="text-lg text-white font-serif">${activeNode.title}</h4><a href="${activeNode.url}" target="_blank" class="text-xs text-blue-400">Fullscreen</a></div><iframe src="${activeNode.url}" class="w-full flex-grow rounded-xl bg-white border border-white/10"></iframe></div>`;
        else if (activeNode.fileType === 'Image') html = `<div class="w-full max-w-5xl text-center"><h4 class="text-lg text-white font-serif mb-4">${activeNode.title}</h4><img src="${activeNode.url}" class="max-w-full max-h-[70vh] object-contain rounded-xl mx-auto border border-white/10"></div>`;
        else html = `<div class="w-full max-w-3xl glass-panel p-8 rounded-3xl"><h4 class="text-2xl text-white font-serif mb-4">${activeNode.title}</h4><div class="prose prose-invert text-sm text-gray-300 whitespace-pre-wrap">${activeNode.url}</div></div>`;
        previewCont.innerHTML = html;
    } else { previewCont.innerHTML = `<div class="text-center text-gray-500"><i data-lucide="play-circle" class="w-16 h-16 mx-auto mb-4 text-white/10"></i><h4 class="text-xl text-white font-serif">Select a Module</h4></div>`; }
    lucide.createIcons();
};

// --- ADMIN FORM LOGIC ---
window.getScheduleRowHTML = (schedule = {}) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; const types = ['Teaching Class', 'Group Practice', 'Workshop', '1-on-1 Coaching', 'Online Session'];
    return `<div class="schedule-row flex flex-wrap gap-3 items-end bg-black/40 p-3 rounded-lg border border-white/5 relative"><div class="flex-grow"><select class="s-day w-full bg-black/60 border border-white/10 rounded-md px-2 py-1 text-white text-xs">${days.map(day => `<option value="${day}" ${schedule.day === day ? 'selected' : ''}>${day}</option>`).join('')}</select></div><div class="flex-grow"><input type="time" class="s-time w-full bg-black/60 border border-white/10 rounded-md px-2 py-1 text-white text-xs" value="${schedule.time || '10:00'}"></div><div class="flex-grow"><select class="s-type w-full bg-black/60 border border-white/10 rounded-md px-2 py-1 text-white text-xs">${types.map(t => `<option value="${t}" ${schedule.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><button type="button" onclick="window.removeScheduleRow(this)" class="text-red-400 bg-red-500/10 px-2 py-1 rounded-md"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`;
};
window.addScheduleRow = () => { const c = document.getElementById('schedule-container'); if (c) { c.insertAdjacentHTML('beforeend', window.getScheduleRowHTML()); lucide.createIcons(); } };
window.removeScheduleRow = (btn) => { const r = btn.closest('.schedule-row'); if (r) r.remove(); };
window.setAdminTab = (tab) => { state.adminTab = tab; state.editingCourse = null; renderApp(); };
window.editCourse = (id) => { const course = state.dynamicCourses.find(c => c.id.toString() === id.toString()); state.editingCourse = course; state.editingCourseMaterials = course.materials ? JSON.parse(JSON.stringify(course.materials)) : []; state.adminTab = 'create_course'; renderApp(); renderAdminMaterialsTree(); };

window.handleCreateCourse = async (e) => {
    e.preventDefault(); const form = e.target; const docId = state.editingCourse ? state.editingCourse.id.toString() : Date.now().toString();
    const schedules = Array.from(document.querySelectorAll('.schedule-row')).map(row => ({ day: row.querySelector('.s-day').value, time: row.querySelector('.s-time').value, type: row.querySelector('.s-type').value }));
    const getVal = (name) => { const el = form.querySelector(`[name="${name}"]`); return el ? el.value : ''; };
    const courseData = { id: docId, title: getVal('title'), image: getVal('image'), desc: getVal('desc'), features: getVal('features').split(',').map(f => f.trim()).filter(Boolean), facultyName: getVal('facultyName'), facultyImage: getVal('facultyImage'), liveClassLink: getVal('liveClassLink'), price: getVal('price'), feeType: getVal('feeType'), type: getVal('type'), category: getVal('category'), location: getVal('location'), schedule: schedules, materials: state.editingCourseMaterials };

    try {
        const btn = form.querySelector('button[type="submit"]'); btn.innerText = "Saving to Cloud..."; btn.disabled = true;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', docId), courseData);
        window.showToast("Saved to Cloud!"); window.setAdminTab('dashboard');
    } catch(err) { window.showToast("Error saving to cloud database.", true); form.querySelector('button[type="submit"]').disabled = false; }
};
window.deleteCourse = async (id) => { try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'courses', id.toString())); window.showToast("Deleted from Database."); } catch(e) { window.showToast("Error.", true); } };

window.updateFilter = (filterKey, value) => { state.filters[filterKey] = value; renderClassesGrid(); };
window.renderClassesGrid = () => {
    const grid = document.getElementById('classes-grid'); if (!grid) return;
    const filtered = state.dynamicCourses.filter(cls => (cls.title.toLowerCase().includes(state.filters.search.toLowerCase()) || cls.desc.toLowerCase().includes(state.filters.search.toLowerCase())) && (state.filters.type === 'All' || cls.type === state.filters.type) && (state.filters.category === 'All' || cls.category === state.filters.category));
    grid.innerHTML = filtered.length === 0 ? `<div class="col-span-full py-20 text-center text-gray-500">No courses found.</div>` : filtered.map(cls => {
        const hasAccess = state.userBookings[cls.id.toString()] || (state.user && state.user.email === ADMIN_EMAIL);
        return `<div class="glass-panel p-8 rounded-[2rem] flex flex-col h-full group border border-white/5 hover:border-red-900/50 transition-colors">
            <div class="flex justify-between items-start mb-6"><div class="p-3 rounded-full bg-white/5 border border-white/10 group-hover:bg-red-600 transition-colors"><i data-lucide="${cls.type === 'Online' ? 'video' : 'map-pin'}" class="w-5 h-5 text-white"></i></div><span class="text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-black/50 border border-white/10 px-3 py-1 rounded-full">${cls.type}</span></div>
            ${cls.image ? `<img src="${cls.image}" class="w-full h-40 object-cover rounded-xl mb-6">` : ''}
            <h3 class="text-2xl font-light text-white mb-2 font-serif">${cls.title}</h3><p class="text-xs text-gray-400 font-light mb-6 flex-grow">${cls.desc}</p>
            <div class="mb-6 pt-4 border-t border-white/5">${hasAccess ? `<button onclick="window.openClassroom('${cls.id}')" class="w-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 py-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2"><i data-lucide="monitor-play" class="w-4 h-4"></i> Enter Workspace</button>` : `<div class="bg-black/50 border border-white/5 rounded-xl p-3 flex items-center gap-3"><div class="p-2 bg-red-600/10 text-red-500 rounded-full"><i data-lucide="lock" class="w-3.5 h-3.5"></i></div><div><p class="text-xs text-white">Content Locked</p></div></div>`}</div>
            <div class="pt-6 border-t border-white/10 mt-auto flex items-center justify-between"><span class="text-2xl text-white font-light">${cls.price}</span><button onclick="window.bookSession('${cls.id}')" class="bg-white text-black px-6 py-3 rounded-full text-xs font-bold uppercase hover:bg-red-600 hover:text-white transition-colors">Enroll</button></div>
        </div>`;
    }).join(''); lucide.createIcons();
};

const navLinksData = [ { id: 'home', label: 'Home' }, { id: 'classes', label: 'Courses' }, { id: 'library', label: 'Library' }, { id: 'store', label: 'Store' } ];
window.navigate = (page) => { state.currentPage = page; window.closeMobileMenu(); renderApp(); window.scrollTo(0,0); };
window.toggleMobileMenu = () => { state.mobileMenuOpen = !state.mobileMenuOpen; const menu = document.getElementById('mobile-menu'); const overlay = document.getElementById('mobile-menu-overlay'); const icon = document.getElementById('mobile-menu-icon'); updateNavbarUI(); if (state.mobileMenuOpen) { menu.classList.remove('opacity-0', 'translate-x-full', 'pointer-events-none'); menu.classList.add('opacity-100', 'translate-x-0'); overlay.classList.remove('opacity-0', 'pointer-events-none'); overlay.classList.add('opacity-100'); icon.setAttribute('data-lucide', 'x'); } else { menu.classList.add('opacity-0', 'translate-x-full', 'pointer-events-none'); menu.classList.remove('opacity-100', 'translate-x-0'); overlay.classList.add('opacity-0', 'pointer-events-none'); overlay.classList.remove('opacity-100'); icon.setAttribute('data-lucide', 'menu'); } lucide.createIcons(); };
window.closeMobileMenu = () => { if(state.mobileMenuOpen) window.toggleMobileMenu(); }

const updateNavbarUI = () => {
    const isAdmin = state.user && state.user.email === ADMIN_EMAIL;
    const links = [...navLinksData]; if (isAdmin) links.push({ id: 'admin', label: 'Admin Panel' });
    const dLinks = document.getElementById('nav-links'); if (dLinks) dLinks.innerHTML = links.map(link => `<button onclick="window.navigate('${link.id}')" class="relative text-xs font-semibold uppercase tracking-[0.2em] py-2 ${state.currentPage === link.id ? 'text-white' : (link.id === 'admin' ? 'text-red-500' : 'text-gray-500 hover:text-white')}">${link.label}</button>`).join('');
    const mLinks = document.getElementById('mobile-nav-links'); if (mLinks) mLinks.innerHTML = `<div class="flex flex-col gap-6 pt-10">${links.map(link => `<button onclick="window.navigate('${link.id}')" class="text-left text-3xl font-serif italic text-white/80 hover:text-white">${link.label}</button>`).join('')}</div>`;
    const dAuth = document.getElementById('auth-container-desktop'); if (dAuth) { if (state.user && !state.user.isAnonymous) dAuth.innerHTML = `<div class="flex items-center gap-4"><span class="text-[11px] font-bold tracking-widest text-white px-4 py-2 border border-white/20 rounded-full">${isAdmin?'ADMIN':(state.user.email ? state.user.email.split('@')[0] : 'User')}</span><button onclick="window.handleSignOut()" class="text-xs text-red-500 font-bold uppercase">Logout</button></div>`; else dAuth.innerHTML = `<button onclick="window.openAuthModal()" class="bg-white text-black px-8 py-3 rounded-full text-xs font-bold uppercase hover:bg-gray-200">Sign In</button>`; }
    lucide.createIcons(); initLanguageSelects();
};
const updateCartBadge = () => { const badge = document.getElementById('cart-badge'); if (badge) { if (state.cartCount > 0) { badge.innerText = state.cartCount; badge.classList.remove('hidden'); badge.classList.add('flex'); } else { badge.classList.add('hidden'); badge.classList.remove('flex'); } } };

const templates = {
    home: () => `<div class="page-transition"><div class="relative min-h-screen flex items-center pt-20 overflow-hidden"><div class="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&q=90&w=2000')] bg-cover bg-center opacity-30"></div><div class="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent"></div><div class="relative z-10 max-w-screen-2xl mx-auto px-6 w-full"><p class="text-red-600 text-sm font-bold tracking-[0.4em] uppercase mb-6 flex items-center gap-4"><span class="w-10 h-[1px] bg-red-600"></span> Premium Institute</p><h1 class="text-5xl md:text-7xl font-light text-white mb-8">Elevate your <br><span class="font-serif italic">musical journey.</span></h1><button onclick="window.navigate('classes')" class="bg-white text-black px-10 py-5 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-gray-200">Start Learning</button></div></div></div>`,
    library: () => `<div class="pt-40 pb-32 min-h-screen page-transition text-center px-6"><i data-lucide="play-circle" class="w-16 h-16 text-gray-600 mx-auto mb-6"></i><h2 class="text-4xl text-white font-serif mb-4">The Library</h2><p class="text-gray-400">Library view logic remains active.</p></div>`,
    classes: () => `<div class="pt-32 pb-32 px-6 md:px-12 max-w-screen-2xl mx-auto min-h-screen page-transition"><div class="max-w-4xl mb-12"><h2 class="text-5xl md:text-7xl font-light text-white font-serif">Master your craft.</h2></div><div id="classes-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"></div></div>`,
    store: () => `<div class="pt-40 pb-32 min-h-screen page-transition text-center px-6"><i data-lucide="shopping-bag" class="w-16 h-16 text-gray-600 mx-auto mb-6"></i><h2 class="text-4xl text-white font-serif mb-4">Pro Store</h2><p class="text-gray-400">Storefront logic remains active.</p></div>`,
    admin: () => `
        <div class="pt-32 pb-32 px-6 md:px-12 max-w-screen-2xl mx-auto min-h-screen page-transition">
            <div class="flex gap-4 mb-10 overflow-x-auto border-b border-white/10 pb-4">
                <button onclick="window.setAdminTab('dashboard')" class="px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${state.adminTab === 'dashboard' ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400'}">Overview</button>
                <button onclick="window.setAdminTab('users')" class="px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${state.adminTab === 'users' ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400'}">Manage Users</button>
                <button onclick="window.setAdminTab('create_course')" class="px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${state.adminTab === 'create_course' ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400'}">Manage Courses</button>
            </div>
            ${state.adminTab === 'dashboard' ? `<div class="glass-panel p-8 rounded-3xl"><h3 class="text-2xl text-white font-serif mb-4">Cloud Status</h3><p class="text-sm text-green-400">All systems syncing to cloud natively.</p></div>` : ''}
            ${state.adminTab === 'users' ? `
            <div class="glass-panel p-8 rounded-3xl overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-400 min-w-[600px]"><thead class="text-xs uppercase bg-white/5 font-bold"><tr><th class="p-4">Email</th><th class="p-4">ID</th><th class="p-4 text-right">Actions</th></tr></thead><tbody>
                    ${state.allUsers.map(u => `<tr class="border-b border-white/5 hover:bg-white/5"><td class="p-4 text-white">${u.email}</td><td class="p-4 font-mono text-xs">${u.id}</td><td class="p-4 text-right"><button onclick="window.openManageAccessModal('${u.id}', '${u.email}')" class="bg-white text-black hover:bg-red-600 hover:text-white px-4 py-2 rounded-full text-xs font-bold transition-colors">Manage Access</button></td></tr>`).join('')}
                </tbody></table>
            </div>` : ''}
            ${state.adminTab === 'create_course' ? `
            <div class="max-w-4xl">
                <div class="flex justify-between items-center mb-6"><h3 class="text-2xl text-white font-serif">${state.editingCourse ? 'Edit: '+state.editingCourse.title : 'New Course'}</h3>${state.editingCourse ? `<button onclick="window.setAdminTab('create_course')" class="text-xs text-gray-400 border px-3 py-1 rounded-full">Cancel</button>`:''}</div>
                <div class="flex gap-2 overflow-x-auto mb-8 pb-2">${state.dynamicCourses.map(c => `<button onclick="window.editCourse('${c.id}')" class="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-xs whitespace-nowrap text-white">${c.title}</button>`).join('')}</div>
                <form onsubmit="window.handleCreateCourse(event)" class="glass-panel p-8 rounded-[2rem] space-y-6">
                    <div class="grid grid-cols-2 gap-6">
                        <div><label class="block text-[10px] uppercase text-gray-400 mb-2">Title</label><input type="text" name="title" required value="${state.editingCourse?.title||''}" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                        <div><label class="block text-[10px] uppercase text-gray-400 mb-2">Price</label><input type="text" name="price" required value="${state.editingCourse?.price||''}" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                        <div class="col-span-2"><label class="block text-[10px] uppercase text-gray-400 mb-2">Desc</label><textarea name="desc" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white">${state.editingCourse?.desc||''}</textarea></div>
                        <div><label class="block text-[10px] uppercase text-gray-400 mb-2">Type</label><select name="type" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white"><option value="Online" ${state.editingCourse?.type==='Online'?'selected':''}>Online</option><option value="Offline" ${state.editingCourse?.type==='Offline'?'selected':''}>Offline</option></select></div>
                        <div><label class="block text-[10px] uppercase text-gray-400 mb-2">Category</label><input type="text" name="category" value="${state.editingCourse?.category||''}" class="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white"></div>
                    </div>
                    <div class="border-t border-white/10 pt-6">
                        <h4 class="text-lg text-white font-serif mb-4">Materials Builder</h4>
                        <div class="flex gap-2 mb-4"><button type="button" onclick="window.addRootFolder()" class="text-xs bg-white/10 px-3 py-1 rounded-full">+ Folder</button><button type="button" onclick="window.addRootFile()" class="text-xs bg-white/10 px-3 py-1 rounded-full">+ File</button></div>
                        <div id="materials-tree-builder" class="space-y-4"></div>
                    </div>
                    <button id="save-course-btn" type="submit" class="w-full bg-red-600 text-white py-4 rounded-full text-xs font-bold uppercase mt-8 hover:bg-red-700">Save to Cloud DB</button>
                    ${state.editingCourse ? `<button type="button" onclick="window.deleteCourse('${state.editingCourse.id}')" class="w-full bg-transparent text-red-500 py-3 rounded-full text-xs font-bold uppercase mt-2 hover:bg-red-900/20">Delete Course</button>` : ''}
                </form>
            </div>` : ''}
        </div>`
};

const renderApp = () => { document.getElementById('app-root').innerHTML = templates[state.currentPage](); updateNavbarUI(); lucide.createIcons(); if (state.currentPage === 'classes') renderClassesGrid(); if (state.currentPage === 'admin' && state.adminTab === 'create_course') renderAdminMaterialsTree(); };
renderApp();