class EnglishWordsApp {
  constructor() {
    this.currentSection = 'about';
    this.currentLevel = null;
    this.currentCategory = null;
    this.learningWords = [];
    this.customWords = [];
    this.wordStats = {};
    this.weeklyProgress = [];
    this.currentMode = 'flashcards';
    this.currentPractice = 'scheduled';
    this.currentReviewIndex = 0;
    this.showFilter = 'all';
    this.gameQuizIntervals = {}; // {containerId: {warningTimeoutId, quizTimeoutId}}

    // runtime flags
    this.lastFlashcardFrontWasRussian = false;
    this.currentAudio = null;

    this.loadData();
    this.initializeUI();
    this.renderProgress();
  }

  // =========================
  // Helpers: language & audio
  // =========================
  isRussian(text) {
    return /[а-яё]/i.test(text || '');
  }
  isEnglish(text) {
    return /[a-z]/i.test(text || '');
  }
  getEnglishDisplay(wordObj) {
    if (!wordObj) return '';
    if (wordObj.forms && Array.isArray(wordObj.forms) && wordObj.forms.length > 0) {
      return wordObj.forms.join(' → ');
    }
    return wordObj.word;
  }
  getBaseEnglish(wordObj) {
    if (!wordObj) return '';
    return (wordObj.forms && wordObj.forms.length > 0) ? wordObj.forms[0] : wordObj.word;
  }

  cleanWordForAudio(raw) {
    if (!raw) return '';
    const w = String(raw).toLowerCase().trim();
    // keep letters, apostrophes, hyphen and spaces (for phrasals)
    const basic = w.replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
    return basic;
  }
  sanitizeForSpeech(raw) {
    if (!raw) return '';
    // remove arrows and any punctuation except hyphen/apostrophe/spaces
    return String(raw)
      .toLowerCase()
      .replace(/→/g, ' ')
      .replace(/[^a-z\s'-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  buildAudioCandidates(baseWord) {
    const cleaned = this.cleanWordForAudio(baseWord);
    if (!cleaned) return [];
    const noSpace = cleaned.replace(/\s+/g, '');
    const firstToken = cleaned.split(' ')[0];
    const uniq = [];
    [cleaned, noSpace, firstToken].forEach(c => {
      if (c && !uniq.includes(c)) uniq.push(c);
    });
    return uniq;
  }
  buildAudioUrl(wordCandidate, region = 'us') {
    const clean = (wordCandidate || '').toLowerCase();
    return `https://wooordhunt.ru/data/sound/sow/${region}/${clean}.mp3`;
  }
  stopCurrentAudio() {
    try {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.src = '';
        this.currentAudio = null;
      }
      if (window && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }
  // MP3 play that resolves when playback finishes (no overlap)
  playMp3Url(url) {
    return new Promise((resolve, reject) => {
      try {
        this.stopCurrentAudio();
        const audio = new Audio(url);
        this.currentAudio = audio;

        let endedOrFailed = false;
        const cleanup = () => {
          if (endedOrFailed) return;
          endedOrFailed = true;
          try {
            audio.onended = null;
            audio.onerror = null;
            audio.oncanplaythrough = null;
          } catch {}
        };

        audio.oncanplaythrough = () => {
          audio.play().catch(err => {
            cleanup();
            reject(err);
          });
        };
        audio.onended = () => {
          cleanup();
          resolve(true);
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error('Audio error'));
        };
        // Safety timeout (in case no ended fires)
        setTimeout(() => {
          if (!endedOrFailed && audio && !audio.paused) return; // still playing
          if (!endedOrFailed) {
            try { audio.pause(); } catch {}
            cleanup();
            reject(new Error('Audio timeout'));
          }
        }, 15000);
      } catch (e) {
        reject(e);
      }
    });
  }
  async playSpeechFallback(word) {
    const text = this.sanitizeForSpeech(word);
    if (!text) return false;
    if ('speechSynthesis' in window && this.isEnglish(text)) {
      try {
        await new Promise((resolve) => {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'en-US';
          u.rate = 0.9; // per request
          u.onend = resolve;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        });
        return true;
      } catch {}
    }
    return false;
  }
  // Core play single word (mp3). Prefer WoorDhunt; fallback to speech only if mp3 fails
  async playSingleWordMp3(word, regionPreferred = 'us') {
    const candidates = this.buildAudioCandidates(word);
    if (candidates.length === 0) return this.playSpeechFallback(word);

    const tryRegions = regionPreferred === 'uk' ? ['uk', 'us'] : ['us', 'uk'];

    for (const cand of candidates) {
      for (const region of tryRegions) {
        try {
          await this.playMp3Url(this.buildAudioUrl(cand, region));
          return true;
        } catch (e) {
          // try next
        }
      }
    }
    return this.playSpeechFallback(word);
  }
  // Sequence play for irregular forms (strictly sequential, no overlap)
  async playFormsSequence(forms, regionPreferred = 'us') {
    if (!forms || !forms.length) return false;
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      await this.playSingleWordMp3(form, regionPreferred);
      // small pause between words
      await new Promise(res => setTimeout(res, 200));
    }
    return true;
  }
  // Public unified API for UI buttons
  async playWord(word, forms = null, region = null) {
    if (typeof forms === 'string') {
      forms = [forms];
    }
    const regionPref = (region === 'uk' || region === 'us') ? region : 'us';
    if (forms && Array.isArray(forms) && forms.length) {
      try {
        await this.playFormsSequence(forms, regionPref);
        return;
      } catch {
        // fallback to base
      }
    }
    await this.playSingleWordMp3(word, regionPref);
  }

  // =========================
  // Image helpers
  // =========================
  getPrimaryImageUrl(wordObj) {
    const base = (this.getBaseEnglish(wordObj) || '').toLowerCase().trim();
    // источник: britlex (нужен lower-case + encodeURIComponent)
    return `https://britlex.ru/images/${encodeURIComponent(base)}.jpg`;
  }
  getFallbackImageUrl() {
    const n = Math.floor(Math.random() * 100) + 1;
    return `${n}.jpg`;
  }
  handleImageError(imgEl) {
    // Первая ошибка: подставить рандом 1..100
    if (!imgEl.dataset.fallbackTried) {
      imgEl.dataset.fallbackTried = '1';
      imgEl.src = this.getFallbackImageUrl();
      return;
    }
    // Вторая ошибка: подставить nophoto
    imgEl.onerror = null;
    imgEl.src = 'nophoto.jpg';
  }
  handleMotivationImageError(imgEl) {
    // Сначала пробуем mN.jpg из корня, затем nophoto
    if (!imgEl.dataset.step) {
      imgEl.dataset.step = '1';
      const current = imgEl.dataset.index || '1';
      imgEl.src = `m${current}.jpg`;
      return;
    } else {
      imgEl.onerror = null;
      imgEl.src = 'nophoto.jpg';
    }
  }

  // =========================
  // Initialize UI and events
  // =========================
  initializeUI() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // Support button
    const supportBtn = document.getElementById('supportBtn');
    if (supportBtn) {
      supportBtn.addEventListener('click', () => this.showSupportModal());
    }

    // Navigation buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const section = e.currentTarget.getAttribute('data-section');
        if (section) {
          this.switchSection(section);
        }
      });
    });

    // Level cards
    document.querySelectorAll('.level-card[data-level]').forEach(card => {
      card.addEventListener('click', (e) => {
        const level = e.currentTarget.getAttribute('data-level');
        if (level) {
          this.showLevelWords(level);
        }
      });
    });

    // Category cards
    document.querySelectorAll('.level-card[data-category]').forEach(card => {
      card.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-category');
        if (cat) {
          this.showCategoryWords(cat);
        }
      });
    });

    // Back to levels
    const backBtn = document.getElementById('backToLevels');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.backToLevels());
    }

    // Add word button
    const addWordBtn = document.getElementById('addWordBtn');
    if (addWordBtn) {
      addWordBtn.addEventListener('click', () => this.addSingleWord());
    }

    // Bulk add button
    const bulkAddBtn = document.getElementById('bulkAddBtn');
    if (bulkAddBtn) {
      bulkAddBtn.addEventListener('click', () => this.bulkAddWords());
    }

    // Mode toggle buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentMode = e.currentTarget.getAttribute('data-mode');
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderLearningSection();
      });
    });

    // Practice toggle buttons
    document.querySelectorAll('.practice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentPractice = e.currentTarget.getAttribute('data-practice');
        document.querySelectorAll('.practice-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderLearningSection();
      });
    });

    // Add/Remove all level buttons
    const addAllBtn = document.getElementById('addAllLevelBtn');
    if (addAllBtn) {
      addAllBtn.addEventListener('click', () => this.addAllLevelWords());
    }

    const removeAllBtn = document.getElementById('removeAllLevelBtn');
    if (removeAllBtn) {
      removeAllBtn.addEventListener('click', () => this.removeAllLevelWords());
    }

    // Game buttons
    const surfBtn = document.getElementById('surfStartBtn');
    if (surfBtn) {
      surfBtn.addEventListener('click', () => this.showQuizGateForGame('Subway Surfers', 'subway.html'));
    }

    const doodleBtn = document.getElementById('doodleStartBtn');
    if (doodleBtn) {
      doodleBtn.addEventListener('click', () => this.showQuizGateForGame('Doodle Jump', 'doodle-jump.html'));
    }

    const game2048Btn = document.getElementById('game2048StartBtn');
    if (game2048Btn) {
      game2048Btn.addEventListener('click', () => this.showQuizGateForGame('2048', '2048.html'));
    }

    const rocketBtn = document.getElementById('rocketStartBtn');
    if (rocketBtn) {
      rocketBtn.addEventListener('click', () => this.showQuizGateForGame('Rocket Soccer Derby', 'rocket-soccer.html'));
    }

    const catalogBtn = document.getElementById('catalogStartBtn');
    if (catalogBtn) {
      catalogBtn.addEventListener('click', () => this.showCatalogGame());
    }

    this.updateLevelCounts();
    this.renderLearningSection();
    this.renderCustomWords();
  }

  // =========
  // Storage
  // =========
  loadData() {
    try {
      this.learningWords = JSON.parse(localStorage.getItem('learningWords') || '[]');
      this.customWords = JSON.parse(localStorage.getItem('customWords') || '[]');
      this.wordStats = JSON.parse(localStorage.getItem('wordStats') || '{}');
      this.weeklyProgress = JSON.parse(localStorage.getItem('weeklyProgress') || '[]');
    } catch (e) {
      console.error('Error loading data:', e);
      this.learningWords = [];
      this.customWords = [];
      this.wordStats = {};
      this.weeklyProgress = [];
    }
  }
  saveData() {
    try {
      localStorage.setItem('learningWords', JSON.stringify(this.learningWords));
      localStorage.setItem('customWords', JSON.stringify(this.customWords));
      localStorage.setItem('wordStats', JSON.stringify(this.wordStats));
      localStorage.setItem('weeklyProgress', JSON.stringify(this.weeklyProgress));
    } catch (e) {
      console.error('Error saving data:', e);
    }
  }

  // =========
  // Theme
  // =========
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const icon = document.querySelector('#themeToggle i');
    if (icon) {
      icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }

  // =========
  // Support
  // =========
  showSupportModal() {
    const modal = document.createElement('div');
    modal.className = 'support-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div class="support-modal-content" style="background:var(--bg-primary);border-radius:16px;padding:30px;max-width:500px;width:100%;box-shadow:var(--shadow-lg);">
        <h2 style="margin-bottom:15px;color:var(--text-primary);">❤️ Поддержать проект</h2>
        <p style="margin-bottom:15px;color:var(--text-secondary);">Это бесплатный сервис без рекламы, который создан с любовью к изучению английского языка. Проект может развиваться и существовать благодаря вашим донатам.</p>
        <p style="margin-bottom:15px;color:var(--text-secondary);">Если вам понравилось наше приложение и оно помогает вам учить английский, не забудьте поддержать разработку!</p>
        <p style="margin-bottom:20px;color:var(--text-secondary);"><strong>Об авторе:</strong><br>Приложение создано на основе методики Абдуррахима Бердиева. Вся прибыль от донатов идет на развитие и улучшение функционала приложения.</p>
        <a href="https://pay.cloudtips.ru/p/8f56d7d3" target="_blank" class="btn btn-primary" style="text-decoration:none;display:inline-block;margin-right:10px;margin-bottom:10px;">
          <i class="fas fa-heart"></i> Поддержать проект
        </a>
        <button class="btn btn-secondary" onclick="this.closest('.support-modal').remove()">Закрыть</button>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  }

  // =========
  // Sections
  // =========
  switchSection(section) {
    this.currentSection = section;

    // Stop any ongoing audio when switching sections to avoid stray playback (like 'airport')
    this.stopCurrentAudio();

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById(section);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-section="${section}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (section === 'levels') this.backToLevels();
    if (section === 'learning') this.renderLearningSection();
    if (section === 'progress') this.renderProgress();
    if (section === 'new-words') this.renderCustomWords();
  }

  // =========
  // Levels
  // =========
  updateLevelCounts() {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    levels.forEach(level => {
      const words = oxfordWordsDatabase[level] || [];
      const card = document.querySelector(`[data-level="${level}"] .word-count`);
      if (card) card.textContent = `${words.length} слов`;
    });

    const irregulars = oxfordWordsDatabase['IRREGULARS'] || [];
    const irregCard = document.querySelector('[data-category="IRREGULARS"] .word-count');
    if (irregCard) irregCard.textContent = `${irregulars.length} слов`;

    const prepositions = oxfordWordsDatabase['PREPOSITIONS'] || [];
    const prepCard = document.querySelector('[data-category="PREPOSITIONS"] .word-count');
    if (prepCard) prepCard.textContent = `${prepositions.length} слов`;
  }

  showLevelWords(level) {
    // cancel any audio on entering lists
    this.stopCurrentAudio();

    this.currentLevel = level;
    this.currentCategory = null;

    const words = oxfordWordsDatabase[level] || [];
    const container = document.getElementById('wordsContainer');
    const title = document.getElementById('currentLevelTitle');
    const wordsList = document.getElementById('wordsList');

    if (container) container.classList.remove('hidden');
    if (title) title.textContent = `${level} - ${words.length} слов`;

    if (wordsList) {
      wordsList.innerHTML = words.map(word => this.createWordCard(word, level)).join('');
      this.attachWordCardListeners();
    }

    // Автопрокрутка к списку
    if (container) {
      setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  showCategoryWords(category) {
    // cancel any audio on entering lists
    this.stopCurrentAudio();

    this.currentCategory = category;
    this.currentLevel = null;

    const words = oxfordWordsDatabase[category] || [];
    const container = document.getElementById('wordsContainer');
    const title = document.getElementById('currentLevelTitle');
    const wordsList = document.getElementById('wordsList');

    if (container) container.classList.remove('hidden');

    const categoryName = category === 'IRREGULARS' ? 'Неправильные глаголы' : 'Предлоги';
    if (title) title.textContent = `${categoryName} - ${words.length} слов`;

    if (wordsList) {
      wordsList.innerHTML = words.map(word => this.createWordCard(word, category)).join('');
      this.attachWordCardListeners();
    }

    // Автопрокрутка к списку
    if (container) {
      setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  backToLevels() {
    this.stopCurrentAudio();
    const container = document.getElementById('wordsContainer');
    if (container) container.classList.add('hidden');
    this.currentLevel = null;
    this.currentCategory = null;
  }

  // =========
  // Word cards
  // =========
  createWordCard(word, levelOrCategory) {
    const isInLearning = this.learningWords.some(w => w.word === word.word && w.level === levelOrCategory);

    let displayText = word.word;
    let translationText = word.translation;

    if (word.forms && word.forms.length > 0) {
      displayText = word.forms.join(' → ');
    }

    return `
      <div class="word-card" data-word="${this.safeAttr(word.word)}" data-level="${this.safeAttr(levelOrCategory)}">
        <div class="word-header">
          <div class="word-text">${displayText}</div>
          <div class="word-actions">
            <button class="action-btn play-btn" title="Произношение (US)" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="action-btn play-btn" title="Произношение (UK)" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')">
              <i class="fas fa-headphones"></i>
            </button>
            ${isInLearning ?
              `<button class="action-btn remove-btn" onclick="app.removeWordFromLearning('${this.safeAttr(word.word)}', '${this.safeAttr(levelOrCategory)}')" title="Удалить из изучаемых">
                <i class="fas fa-trash"></i>
              </button>` :
              `<button class="action-btn add-btn" onclick="app.addWordToLearning('${this.safeAttr(word.word)}', '${this.safeAttr(translationText)}', '${this.safeAttr(levelOrCategory)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'})" title="Добавить в изучаемые">
                <i class="fas fa-plus"></i>
              </button>`
            }
          </div>
        </div>
        <div class="word-translation">${translationText}</div>
        <span class="word-level">${levelOrCategory}</span>
      </div>
    `;
  }
  attachWordCardListeners() {
    // inline onclick
  }
  safeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // =========
  // Learning list
  // =========
  addWordToLearning(word, translation, level, forms = null) {
    // ensure no stray voice like "airport"
    this.stopCurrentAudio();

    const existingWord = this.learningWords.find(w => w.word === word && w.level === level);
    if (!existingWord) {
      const newWord = { word, translation, level, forms: forms || null, isLearned: false, addedAt: Date.now() };
      this.learningWords.push(newWord);
      this.initializeWordStats(word);
      this.saveData();
      this.showNotification(`Слово "${word}" добавлено в изучаемые!`, 'success');

      if (this.currentLevel === level || this.currentCategory === level) {
        this.currentLevel ? this.showLevelWords(this.currentLevel) : this.showCategoryWords(this.currentCategory);
      }
      this.renderLearningSection();
    }
  }
  removeWordFromLearning(word, level) {
    // ensure no stray voice like "airport"
    this.stopCurrentAudio();

    const index = this.learningWords.findIndex(w => w.word === word && w.level === level);
    if (index !== -1) {
      this.learningWords.splice(index, 1);
      this.saveData();
      this.showNotification(`Слово "${word}" удалено из изучаемых`, 'success');

      if (this.currentLevel === level || this.currentCategory === level) {
        this.currentLevel ? this.showLevelWords(this.currentLevel) : this.showCategoryWords(this.currentCategory);
      }
      this.renderLearningSection();
    }
  }
  addAllLevelWords() {
    // ensure no stray voice
    this.stopCurrentAudio();

    const source = this.currentLevel || this.currentCategory;
    if (!source) return;

    const words = oxfordWordsDatabase[source] || [];
    let addedCount = 0;

    words.forEach(word => {
      const exists = this.learningWords.some(w => w.word === word.word && w.level === source);
      if (!exists) {
        this.learningWords.push({
          word: word.word,
          translation: word.translation,
          level: source,
          forms: word.forms || null,
          isLearned: false,
          addedAt: Date.now()
        });
        this.initializeWordStats(word.word);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.saveData();
      this.showNotification(`Добавлено ${addedCount} слов в изучаемые!`, 'success');
      this.currentLevel ? this.showLevelWords(this.currentLevel) : this.showCategoryWords(this.currentCategory);
      this.renderLearningSection();
    } else {
      this.showNotification('Все слова уже добавлены', 'info');
    }
  }
  removeAllLevelWords() {
    // ensure no stray voice
    this.stopCurrentAudio();

    const source = this.currentLevel || this.currentCategory;
    if (!source) return;

    const initialLength = this.learningWords.length;
    this.learningWords = this.learningWords.filter(w => w.level !== source);
    const removedCount = initialLength - this.learningWords.length;

    if (removedCount > 0) {
      this.saveData();
      this.showNotification(`Удалено ${removedCount} слов из изучаемых`, 'success');
      this.currentLevel ? this.showLevelWords(this.currentLevel) : this.showCategoryWords(this.currentCategory);
      this.renderLearningSection();
    }
  }
  initializeWordStats(word) {
    if (!this.wordStats[word]) {
      this.wordStats[word] = {
        correct: 0,
        incorrect: 0,
        lastReview: null,
        nextReview: Date.now(),
        difficulty: 0
      };
    }
  }

  // =========
  // Add words
  // =========
  addSingleWord() {
    // ensure no stray voice
    this.stopCurrentAudio();

    const wordInput = document.getElementById('newWord');
    const translationInput = document.getElementById('newTranslation');
    const levelSelect = document.getElementById('newLevel');

    if (!wordInput || !translationInput || !levelSelect) return;

    const word = wordInput.value.trim();
    const translation = translationInput.value.trim();
    const level = levelSelect.value;

    if (!word || !translation) {
      this.showNotification('Заполните все поля!', 'warning');
      return;
    }

    const newWord = {
      word,
      translation,
      level,
      forms: null,
      isCustom: true,
      addedAt: Date.now()
    };

    const exists = this.customWords.some(w => w.word.toLowerCase() === word.toLowerCase() && w.level === level);
    if (!exists) this.customWords.push(newWord);

    const existsLearn = this.learningWords.some(w => w.word.toLowerCase() === word.toLowerCase() && w.level === level);
    if (!existsLearn) this.learningWords.push({ ...newWord, isLearned: false });

    this.initializeWordStats(word);
    this.saveData();

    wordInput.value = '';
    translationInput.value = '';

    this.showNotification(`Слово "${word}" добавлено!`, 'success');
    this.renderCustomWords();
    this.renderLearningSection();
  }

  // Mass add with robust parsing
  bulkAddWords() {
    // ensure no stray voice
    this.stopCurrentAudio();

    const textarea = document.getElementById('bulkTextarea');
    const levelSelect = document.getElementById('bulkLevel');
    if (!textarea || !levelSelect) return;

    const text = textarea.value.trim();
    const level = levelSelect.value;
    if (!text) {
      this.showNotification('Введите слова для добавления!', 'warning');
      return;
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let addedCount = 0;

    const seen = new Set(this.customWords.map(w => `${w.level}::${w.word.toLowerCase()}`));
    const seenLearn = new Set(this.learningWords.map(w => `${w.level}::${w.word.toLowerCase()}`));

    lines.forEach(line => {
      // Support: "go, went, gone - идти" OR "word - перевод" OR "word — перевод" OR "word: перевод" OR "word<TAB>перевод"
      const parts = line.split(/\s*[-—:|\t]\s*/);
      if (parts.length < 2) return;

      const left = parts[0].trim();
      const translation = parts.slice(1).join(' - ').trim();
      if (!left || !translation) return;

      let word = left;
      let forms = null;
      if (left.includes('→') || left.includes(',')) {
        const rawForms = left.includes('→') ? left.split('→') : left.split(',');
        const cleanedForms = rawForms.map(f => f.trim()).filter(Boolean);
        if (cleanedForms.length >= 2) {
          forms = cleanedForms;
          word = cleanedForms[0];
        }
      }

      const key = `${level}::${word.toLowerCase()}`;
      if (!seen.has(key)) {
        const newWord = { word, translation, level, forms, isCustom: true, addedAt: Date.now() };
        this.customWords.push(newWord);
        seen.add(key);
      }
      if (!seenLearn.has(key)) {
        this.learningWords.push({ word, translation, level, forms, isCustom: true, addedAt: Date.now(), isLearned: false });
        seenLearn.add(key);
        this.initializeWordStats(word);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.saveData();
      textarea.value = '';
      this.showNotification(`Добавлено ${addedCount} слов!`, 'success');
      this.renderCustomWords();
      this.renderLearningSection();
    } else {
      this.showNotification('Новые слова не найдены (возможны дубли)', 'info');
    }
  }

  renderCustomWords() {
    const container = document.getElementById('customWords');
    if (!container) return;

    if (this.customWords.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-plus-circle"></i>
          <h3>Нет добавленных слов</h3>
          <p>Используйте формы выше для добавления новых слов</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.customWords.map(word => `
      <div class="word-card">
        <div class="word-header">
          <div class="word-text">${this.getEnglishDisplay(word)}</div>
          <div class="word-actions">
            <button class="action-btn play-btn" title="US" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="action-btn play-btn" title="UK" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')">
              <i class="fas fa-headphones"></i>
            </button>
            <button class="action-btn remove-btn" onclick="app.deleteCustomWord('${this.safeAttr(word.word)}')" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="word-translation">${word.translation}</div>
        <span class="word-level">${word.level}</span>
      </div>
    `).join('');
  }
  deleteCustomWord(word) {
    // ensure no stray voice
    this.stopCurrentAudio();

    this.customWords = this.customWords.filter(w => w.word !== word);
    this.learningWords = this.learningWords.filter(w => !(w.word === word && w.isCustom));
    this.saveData();
    this.showNotification(`Слово "${word}" удалено`, 'success');
    this.renderCustomWords();
    this.renderLearningSection();
  }

  // =========
  // Learning UI
  // =========
  renderLearningSection() {
    const container = document.getElementById('learningWordsList');
    const countEl = document.getElementById('learningCount');
    if (!container) return;

    if (countEl) countEl.textContent = `${this.learningWords.length} слов`;

    if (this.learningWords.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-book-open"></i>
          <h3>Пока нет слов для изучения</h3>
          <p>Добавьте слова из списка по уровням или создайте новые</p>
        </div>
      `;
      return;
    }

    if (this.currentMode === 'flashcards') {
      this.renderFlashcards();
    } else if (this.currentMode === 'quiz') {
      this.renderQuiz();
    } else if (this.currentMode === 'list') {
      this.renderWordsList();
    }

    // Вставить кнопку поддержки (мотивации) поверх контента
    this.insertMotivationButton(container);
  }

  // =========
  // Motivation UI (popup)
  // =========
  insertMotivationButton(containerEl) {
    if (!containerEl) return;
    if (containerEl.querySelector('#motivationBtn')) return; // уже есть

    const btn = document.createElement('button');
    btn.id = 'motivationBtn';
    btn.className = 'btn btn-primary';
    btn.textContent = 'хочу поддержки 😞';
    btn.style.cssText = 'font-weight:700;margin-bottom:14px;';
    btn.addEventListener('click', () => this.showMotivationPopup());

    containerEl.insertAdjacentElement('afterbegin', btn);
  }
  showMotivationPopup() {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'motivationOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000002;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:20px;';

    // Modal container
    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-primary);border-radius:16px;padding:16px;max-width:800px;width:90%;max-height:90vh;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:12px;';

    // Header with title and close
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;';

    const title = document.createElement('div');
    title.textContent = 'ТВОЯ МОТИВАЦИЯ НА СЕГОДНЯ :';
    title.style.cssText = 'font-weight:900;font-size:18px;color:var(--text-primary);';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-secondary';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Image area
    const n = Math.floor(Math.random() * 61) + 1;
    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;';

    const img = document.createElement('img');
    img.alt = 'motivation';
    // сначала пробуем motivation/mN.jpg, затем mN.jpg
    img.src = `motivation/m${n}.jpg`;
    img.setAttribute('data-index', String(n));
    img.style.cssText = 'max-width:100%;max-height:70vh;height:auto;object-fit:contain;display:block;border-radius:10px;';
    img.onerror = () => this.handleMotivationImageError(img);

    imgWrap.appendChild(img);

    modal.appendChild(header);
    modal.appendChild(imgWrap);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // =========
  // Flashcards
  // =========
  renderFlashcards() {
    const container = document.getElementById('learningWordsList');
    if (!container) return;

    const wordsToReview = this.getWordsToReview();
    if (wordsToReview.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-check-circle"></i>
          <h3>Все слова повторены!</h3>
          <p>Отличная работа! Возвращайтесь позже для новых повторений</p>
        </div>
      `;
      return;
    }

    const word = wordsToReview[this.currentReviewIndex % wordsToReview.length];

    let displayWord = this.getEnglishDisplay(word);
    this.lastFlashcardFrontWasRussian = this.isRussian(displayWord);

    const primaryImg = this.getPrimaryImageUrl(word);

    container.innerHTML = `
      <div class="flashcard" data-testid="flashcard">
        <img src="${primaryImg}" alt="flashcard" class="flashcard-image" onerror="app.handleImageError(this)">
        <div class="flashcard-body">
          <h3 class="flashcard-title">
            ${displayWord}
            <span class="sound-actions">
              <button class="mini-btn" title="US" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')"><i class="fas fa-volume-up"></i></button>
              <button class="mini-btn" title="UK" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')"><i class="fas fa-headphones"></i></button>
            </span>
          </h3>
          <p class="flashcard-subtitle">Нажмите, чтобы увидеть перевод</p>
          <div class="flashcard-answer hidden" id="flashcardAnswer">
            <div class="review-translation">${word.translation}</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary" onclick="app.showFlashcardAnswer()" id="showAnswerBtn" data-testid="flashcard-show-answer">
              <i class="fas fa-eye"></i> Показать ответ
            </button>
            <button class="btn btn-secondary hidden" onclick="app.playCurrentWord()" id="playFlashcardBtn" data-testid="flashcard-play">
              <i class="fas fa-volume-up"></i> Произношение
            </button>
          </div>
          <div class="answer-buttons hidden" id="answerButtons">
            <button class="btn btn-danger" onclick="app.answerFlashcard(false)" data-testid="flashcard-wrong">
              <i class="fas fa-times"></i> Не знал
            </button>
            <button class="btn btn-success" onclick="app.answerFlashcard(true)" data-testid="flashcard-correct">
              <i class="fas fa-check"></i> Знал
            </button>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:15px;color:var(--text-secondary);">
        Карточка ${this.currentReviewIndex + 1} из ${wordsToReview.length}
      </div>
    `;

    // Autoplay: если фронт на английском — сразу озвучка (WoorDhunt-first)
    if (!this.lastFlashcardFrontWasRussian) {
      setTimeout(() => {
        if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
        else this.playSingleWordMp3(word.word, 'us');
      }, 250);
    }
  }
  showFlashcardAnswer() {
    const answer = document.getElementById('flashcardAnswer');
    const showBtn = document.getElementById('showAnswerBtn');
    const playBtn = document.getElementById('playFlashcardBtn');
    const answerBtns = document.getElementById('answerButtons');

    if (answer) answer.classList.remove('hidden');
    if (showBtn) showBtn.classList.add('hidden');
    if (playBtn) playBtn.classList.remove('hidden');
    if (answerBtns) answerBtns.classList.remove('hidden');

    if (this.lastFlashcardFrontWasRussian) {
      const wordsToReview = this.getWordsToReview();
      const word = wordsToReview[this.currentReviewIndex % wordsToReview.length];
      setTimeout(() => {
        if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
        else this.playSingleWordMp3(word.word, 'us');
      }, 200);
    }
  }
  playCurrentWord() {
    const wordsToReview = this.getWordsToReview();
    const word = wordsToReview[this.currentReviewIndex % wordsToReview.length];
    if (word.forms && word.forms.length > 0) {
      this.playFormsSequence(word.forms, 'us');
    } else {
      this.playSingleWordMp3(word.word, 'us');
    }
  }
  answerFlashcard(correct) {
    const wordsToReview = this.getWordsToReview();
    const word = wordsToReview[this.currentReviewIndex % wordsToReview.length];

    this.updateWordStats(word.word, correct);
    this.recordDailyProgress();

    this.currentReviewIndex++;

    if (this.currentReviewIndex >= wordsToReview.length && this.currentPractice === 'scheduled') {
      this.currentReviewIndex = 0;
      this.showNotification('Отличная работа! Все слова повторены!', 'success');
    }

    this.renderFlashcards();
  }

  // =========
  // Quiz
  // =========
  renderQuiz() {
    const container = document.getElementById('learningWordsList');
    if (!container) return;

    const wordsToReview = this.getWordsToReview();
    if (wordsToReview.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-check-circle"></i>
          <h3>Все слова повторены!</h3>
          <p>Отличная работа! Возвращайтесь позже для новых повторений</p>
        </div>
      `;
      return;
    }

    const word = wordsToReview[this.currentReviewIndex % wordsToReview.length];

    // Direction; EN side shows forms
    const direction = Math.random() < 0.5 ? 'EN_RU' : 'RU_EN';
    const questionText = direction === 'EN_RU' ? this.getEnglishDisplay(word) : word.translation;
    const correctAnswer = direction === 'EN_RU' ? word.translation : this.getEnglishDisplay(word);

    const options = this.buildQuizOptions(word, direction);
    const shuffled = this.shuffle(options);

    const primaryImg = this.getPrimaryImageUrl(word);

    container.innerHTML = `
      <div class="quiz-container" data-testid="quiz-container">
        <img src="${primaryImg}" alt="quiz" class="quiz-image" onerror="app.handleImageError(this)">
        <div class="quiz-question">
          ${questionText}
          <span class="sound-actions" style="margin-left:8px;">
            <button class="mini-btn" title="US" onclick="app.quizPlayQuestion('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')"><i class="fas fa-volume-up"></i></button>
            <button class="mini-btn" title="UK" onclick="app.quizPlayQuestion('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')"><i class="fas fa-headphones"></i></button>
          </span>
        </div>
        <div class="quiz-sub">Выберите правильный перевод</div>
        <div class="quiz-options" id="quizOptions">
          ${shuffled.map(opt => {
            const isEnglishOpt = this.isEnglish(opt) && !this.isRussian(opt);
            const baseForSound = opt.split('→')[0].trim();
            const soundBtns = isEnglishOpt ? `
              <span class="option-sound">
                <button class="mini-btn" title="US" onclick="event.stopPropagation(); app.playSingleWordMp3('${this.safeAttr(baseForSound)}', 'us')"><i class="fas fa-volume-up"></i></button>
                <button class="mini-btn" title="UK" onclick="event.stopPropagation(); app.playSingleWordMp3('${this.safeAttr(baseForSound)}', 'uk')"><i class="fas fa-headphones"></i></button>
              </span>
            ` : '';
            return `
              <div class="quiz-option" data-answer="${this.safeAttr(opt)}" onclick="app.selectQuizOption('${this.safeAttr(opt)}', '${this.safeAttr(correctAnswer)}', '${this.safeAttr(word.word)}', '${direction}')">
                <div class="quiz-option-inner">
                  <span>${opt}</span>
                  ${soundBtns}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="text-align:center;margin-top:15px;color:var(--text-secondary);">
          Вопрос ${this.currentReviewIndex + 1} из ${wordsToReview.length}
        </div>
      </div>
    `;

    // Автопроизношение только на «Изучаю»: EN-вопрос — сразу (WoorDhunt-first)
    if (direction === 'EN_RU') {
      setTimeout(() => {
        if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
        else this.playSingleWordMp3(word.word, 'us');
      }, 200);
    }
  }

  quizPlayQuestion(word, forms, region) {
    this.playWord(word, forms, region || 'us');
  }

  buildQuizOptions(word, direction) {
    const correctAnswer = direction === 'EN_RU' ? word.translation : this.getEnglishDisplay(word);
    const options = [correctAnswer];

    const allWords = [...this.learningWords];
    const shuffled = this.shuffle(allWords);

    for (let w of shuffled) {
      if (w.word !== word.word) {
        const wrongOption = direction === 'EN_RU' ? w.translation : this.getEnglishDisplay(w);
        if (!options.includes(wrongOption)) {
          options.push(wrongOption);
        }
      }
      if (options.length >= 4) break;
    }

    if (options.length < 4) {
      const allLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'IRREGULARS', 'PREPOSITIONS'];
      for (let level of allLevels) {
        const levelWords = oxfordWordsDatabase[level] || [];
        const shuffledLevel = this.shuffle(levelWords);
        for (let w of shuffledLevel) {
          const wrongOption = direction === 'EN_RU' ? w.translation : (w.forms && w.forms.length ? w.forms.join(' → ') : w.word);
          if (!options.includes(wrongOption)) {
            options.push(wrongOption);
          }
          if (options.length >= 4) break;
        }
        if (options.length >= 4) break;
      }
    }

    return options.slice(0, 4);
  }

  selectQuizOption(selected, correct, wordToPlay, direction) {
    const isCorrect = selected === correct;
    const options = document.querySelectorAll('.quiz-option');

    options.forEach(opt => {
      opt.style.pointerEvents = 'none';
      const answer = opt.getAttribute('data-answer');

      if (answer === selected) {
        opt.classList.add(isCorrect ? 'correct' : 'wrong');
      }
      if (answer === correct && !isCorrect) {
        opt.classList.add('correct');
      }
    });

    this.updateWordStats(wordToPlay, isCorrect);
    this.recordDailyProgress();

    const wordsToReview = this.getWordsToReview();
    const wordObj = wordsToReview.find(w => w.word === wordToPlay);

    // RU_EN — после ответа: WoorDhunt-first, fallback speech
    if (direction === 'RU_EN') {
      setTimeout(() => {
        if (wordObj && wordObj.forms && wordObj.forms.length > 0) {
          this.playFormsSequence(wordObj.forms, 'us');
        } else {
          this.playSingleWordMp3(wordToPlay, 'us');
        }
      }, 400);
    }

    setTimeout(() => {
      this.currentReviewIndex++;
      if (this.currentReviewIndex >= wordsToReview.length && this.currentPractice === 'scheduled') {
        this.currentReviewIndex = 0;
        this.showNotification('Quiz завершен! Отличная работа!', 'success');
      }
      this.renderQuiz();
    }, 1800);
  }

  renderWordsList() {
    const container = document.getElementById('learningWordsList');
    if (!container) return;

    const wordsToShow = this.currentPractice === 'endless' ? this.learningWords.filter(w => !w.isLearned) : this.getWordsToReview();

    if (wordsToShow.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-check-circle"></i>
          <h3>Нет слов для отображения</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = wordsToShow.map(word => {
      const displayWord = this.getEnglishDisplay(word);
      return `
        <div class="word-card ${word.isLearned ? 'learned' : ''}">
          <div class="word-header">
            <div class="word-text">${displayWord}</div>
            <div class="word-actions">
              <button class="action-btn play-btn" title="US" onclick="app.playWordFromList('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')">
                <i class="fas fa-volume-up"></i>
              </button>
              <button class="action-btn play-btn" title="UK" onclick="app.playWordFromList('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')">
                <i class="fas fa-headphones"></i>
              </button>
              <button class="action-btn ${word.isLearned ? 'add-btn' : 'remove-btn'}" onclick="app.toggleWordLearned('${this.safeAttr(word.word)}')" title="${word.isLearned ? 'Вернуть в изучение' : 'Отметить выученным'}">
                <i class="fas fa-${word.isLearned ? 'undo' : 'check'}"></i>
              </button>
            </div>
          </div>
          <div class="word-translation">${word.translation}</div>
          <span class="word-level">${word.level}</span>
        </div>
      `;
    }).join('');
  }
  playWordFromList(word, forms, region) {
    this.playWord(word, forms, region || 'us');
  }
  toggleWordLearned(word) {
    const wordObj = this.learningWords.find(w => w.word === word);
    if (wordObj) {
      wordObj.isLearned = !wordObj.isLearned;
      this.saveData();
      this.renderLearningSection();
      this.showNotification(
        wordObj.isLearned ? 'Слово отмечено как выученное!' : 'Слово возвращено в изучение',
        'success'
      );
    }
  }

  // =========
  // Review logic
  // =========
  getWordsToReview() {
    if (this.currentPractice === 'endless') {
      return this.learningWords.filter(w => !w.isLearned);
    }
    const now = Date.now();
    return this.learningWords.filter(w => {
      if (w.isLearned) return false;
      const stats = this.wordStats[w.word];
      if (!stats) return true;
      return stats.nextReview <= now;
    });
  }
  updateWordStats(word, correct) {
    if (!this.wordStats[word]) this.initializeWordStats(word);

    const stats = this.wordStats[word];
    stats.lastReview = Date.now();

    if (correct) {
      stats.correct++;
      stats.difficulty = Math.max(0, stats.difficulty - 1);
      const intervals = [
        1000 * 60 * 60, // 1 hour
        1000 * 60 * 60 * 4,
        1000 * 60 * 60 * 24,
        1000 * 60 * 60 * 24 * 3,
        1000 * 60 * 60 * 24 * 7
      ];
      const reviewCount = stats.correct;
      const intervalIndex = Math.min(reviewCount - 1, intervals.length - 1);
      stats.nextReview = Date.now() + intervals[Math.max(0, intervalIndex)];
    } else {
      stats.incorrect++;
      stats.difficulty = Math.min(2, stats.difficulty + 1);
      stats.nextReview = Date.now() + (1000 * 60 * 10);
    }

    this.saveData();
  }
  recordDailyProgress() {
    const today = new Date().toDateString();
    const existing = this.weeklyProgress.find(p => p.date === today);
    if (existing) existing.count++;
    else this.weeklyProgress.push({ date: today, count: 1 });

    this.weeklyProgress = this.weeklyProgress.slice(-7);
    this.saveData();
  }

  // =========
  // Progress
  // =========
  renderProgress() {
    const container = document.getElementById('progressContent');
    if (!container) return;

    const totalWords = this.learningWords.length;
    const learnedWords = this.learningWords.filter(w => w.isLearned).length;
    const inProgress = totalWords - learnedWords;

    const levelProgress = {};
    ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'IRREGULARS', 'PREPOSITIONS'].forEach(level => {
      const total = this.learningWords.filter(w => w.level === level).length;
      const learned = this.learningWords.filter(w => w.level === level && w.isLearned).length;
      levelProgress[level] = { total, learned };
    });

    container.innerHTML = `
      <div class="progress-card">
        <h3 style="margin-bottom:15px;">Общий прогресс</h3>
        <div class="progress-row"><span>Всего слов:</span><strong>${totalWords}</strong></div>
        <div class="progress-row"><span>Выучено:</span><strong style="color:var(--accent-color);">${learnedWords}</strong></div>
        <div class="progress-row"><span>В процессе:</span><strong style="color:var(--primary-color);">${inProgress}</strong></div>
        <div class="progress-bar-wrap" style="margin-top:10px;">
          <div class="progress-bar-fill" style="width:${totalWords > 0 ? (learnedWords / totalWords * 100) : 0}%"></div>
        </div>
      </div>

      <div class="progress-card">
        <h3 style="margin-bottom:15px;">Прогресс по уровням</h3>
        ${Object.entries(levelProgress).map(([level, data]) => {
          if (data.total === 0) return '';
          const percent = (data.learned / data.total * 100).toFixed(0);
          return `
            <div style="margin-bottom:12px;">
              <div class="progress-row"><span>${level}</span><span>${data.learned} / ${data.total}</span></div>
              <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${percent}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="progress-card">
        <h3 style="margin-bottom:15px;">Активность за неделю</h3>
        ${this.weeklyProgress.length > 0 ?
          this.weeklyProgress.map(day => `
            <div class="progress-row">
              <span>${new Date(day.date).toLocaleDateString('ru-RU', {weekday: 'short', month: 'short', day: 'numeric'})}</span>
              <strong>${day.count} повторений</strong>
            </div>
          `).join('') :
          '<p style="color:var(--text-secondary);text-align:center;">Нет данных об активности</p>'
        }
      </div>
    `;
  }

  // =========
  // Utils
  // =========
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position:fixed;top:80px;left:50%;transform:translateX(-50%);
      background:${type === 'success' ? 'var(--accent-color)' : type === 'warning' ? 'var(--warning-color)' : 'var(--primary-color)'};
      color:white;padding:12px 24px;border-radius:8px;
      box-shadow:var(--shadow-lg);z-index:10000;
      max-width:90%;text-align:center;font-weight:600;
      animation:slideDown 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  getRandomLearningWord() {
    const availableWords = this.learningWords.filter(w => !w.isLearned);
    if (availableWords.length === 0) return null;
    return availableWords[Math.floor(Math.random() * availableWords.length)];
  }

  // =========
  // Gated quiz before game
  // =========
  showQuizGateForGame(gameName, gameFile) {
    if (this.learningWords.filter(w => !w.isLearned).length < 3) {
      this.showNotification('Чтобы играть, добавьте минимум 3 слова в «Изучаю»', 'warning');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'gameQuizOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

    const gameContainer = document.createElement('div');
    gameContainer.style.cssText = 'background:rgba(255,255,255,0.95);border-radius:16px;padding:20px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Закрыть';
    closeBtn.className = 'btn btn-secondary';
    closeBtn.style.marginBottom = '10px';
    closeBtn.onclick = () => overlay.remove();

    const gameTitle = document.createElement('h2');
    gameTitle.textContent = `${gameName} - Quiz`;
    gameTitle.style.cssText = 'text-align:center;margin-bottom:20px;color:#333;';

    const quizContainer = document.createElement('div');
    quizContainer.id = 'quizGateContainer';

    const scoreDisplay = document.createElement('div');
    scoreDisplay.id = 'scoreGateDisplay';
    scoreDisplay.style.cssText = 'text-align:center;font-size:18px;font-weight:bold;margin-top:15px;color:#667eea;';
    scoreDisplay.innerHTML = 'Правильных ответов: <span id="gateScore">0</span>/3';

    gameContainer.appendChild(closeBtn);
    gameContainer.appendChild(gameTitle);
    gameContainer.appendChild(quizContainer);
    gameContainer.appendChild(scoreDisplay);
    overlay.appendChild(gameContainer);
    document.body.appendChild(overlay);

    let correctCount = 0;
    const showNextQuestion = () => {
      const word = this.getRandomLearningWord();
      if (!word) {
        quizContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Недостаточно слов</div>';
        return;
      }
      const direction = Math.random() < 0.5 ? 'EN_RU' : 'RU_EN';
      const questionText = direction === 'EN_RU' ? this.getEnglishDisplay(word) : word.translation;
      const correct = direction === 'EN_RU' ? word.translation : this.getEnglishDisplay(word);
      const options = this.buildQuizOptions(word, direction);
      const shuffled = this.shuffle(options);

      quizContainer.innerHTML = `
        <div style="margin-bottom:15px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#333;margin-bottom:12px;">
            ${questionText}
            <span class="sound-actions" style="margin-left:8px;">
              <button class="mini-btn" title="US" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')"><i class="fas fa-volume-up"></i></button>
              <button class="mini-btn" title="UK" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')"><i class="fas fa-headphones"></i></button>
            </span>
          </div>
          <div style="font-size:14px;color:#666;margin-bottom:12px;">
            Выберите правильный вариант
          </div>
          <div class="quiz-options" style="display:grid;gap:10px;">
            ${shuffled.map(opt => {
              const isEnglishOpt = this.isEnglish(opt) && !this.isRussian(opt);
              const baseForSound = opt.split('→')[0].trim();
              const soundBtns = isEnglishOpt ? `
                <span class="option-sound">
                  <button class="mini-btn" title="US" onclick="event.stopPropagation(); app.playSingleWordMp3('${this.safeAttr(baseForSound)}', 'us')"><i class="fas fa-volume-up"></i></button>
                  <button class="mini-btn" title="UK" onclick="event.stopPropagation(); app.playSingleWordMp3('${this.safeAttr(baseForSound)}', 'uk')"><i class="fas fa-headphones"></i></button>
                </span>
              ` : '';
              return `<div class="quiz-option-gate" data-answer="${this.safeAttr(opt)}" style="padding:12px;border-radius:8px;border:2px solid #e0e0e0;background:#f9f9f9;cursor:pointer;text-align:center;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span>${opt}</span>${soundBtns}
              </div>`;
            }).join('')}
          </div>
        </div>
      `;

      if (direction === 'EN_RU') {
        setTimeout(() => {
          if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
          else this.playSingleWordMp3(word.word, 'us');
        }, 150);
      }

      quizContainer.querySelectorAll('.quiz-option-gate').forEach(opt => {
        opt.addEventListener('click', () => {
          const chosen = opt.getAttribute('data-answer');
          const isCorrect = chosen === correct;

          opt.style.background = isCorrect ? '#d1fae5' : '#fee2e2';
          opt.style.borderColor = isCorrect ? '#10b981' : '#ef4444';

          if (!isCorrect) {
            quizContainer.querySelectorAll('.quiz-option-gate').forEach(o => {
              if (o.getAttribute('data-answer') === correct) {
                o.style.background = '#d1fae5';
                o.style.borderColor = '#10b981';
              }
            });
          }

          if (direction === 'RU_EN') {
            setTimeout(() => {
              if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
              else this.playSingleWordMp3(word.word, 'us');
            }, 200);
          }

          if (isCorrect) {
            correctCount++;
            document.getElementById('gateScore').textContent = correctCount;
            this.recordDailyProgress();

            if (correctCount >= 3) {
              setTimeout(() => {
                overlay.remove();
                this.openGameFullscreen(gameName, gameFile);
              }, 600);
            } else {
              setTimeout(() => showNextQuestion(), 500);
            }
          } else {
            setTimeout(() => showNextQuestion(), 800);
          }
        });
      });
    };
    showNextQuestion();
  }

  // =========
  // Fullscreen game + periodic quizzes (every 5 min)
  // =========
  openGameFullscreen(gameName, gameFile) {
    const containerId = 'gameFullscreenContainer';
    const gameContainer = document.createElement('div');
    gameContainer.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#000;';
    gameContainer.id = containerId;

    const header = document.createElement('div');
    header.className = 'game-header';
    header.style.cssText = `
      position:absolute;top:0;left:0;right:0;height:56px;background:rgba(255,255,255,0.96);
      display:flex;align-items:center;gap:8px;padding:8px 12px;z-index:1000000;box-shadow:0 2px 8px rgba(0,0,0,0.15);
    `;

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.style.cssText = 'font-weight:600;';
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Назад в приложение';
    backBtn.onclick = () => {
      this.clearGameQuizCycle(containerId);
      gameContainer.remove();
    };

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;color:#333;';
    title.textContent = `Игра: ${gameName}`;

    header.appendChild(backBtn);
    header.appendChild(title);

    const iframe = document.createElement('iframe');
    iframe.src = gameFile;
    iframe.style.cssText = 'position:absolute;top:56px;left:0;width:100%;height:calc(100% - 56px);border:none;';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

    gameContainer.appendChild(header);
    gameContainer.appendChild(iframe);
    document.body.appendChild(gameContainer);

    this.showNotification(`Игра ${gameName} запущена! Приятной игры!`, 'success');

    this.startGameQuizCycle(containerId);
  }

  // Внешний каталог с периодическими квизами
  showCatalogGame() {
    if (this.learningWords.filter(w => !w.isLearned).length < 4) {
      this.showNotification('Чтобы играть, добавьте минимум 4 слова в «Изучаю»', 'warning');
      return;
    }

    const containerId = 'catalogGameContainer';
    const gameContainer = document.createElement('div');
    gameContainer.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#000;';
    gameContainer.id = containerId;

    const header = document.createElement('div');
    header.className = 'game-header';
    header.style.cssText = `
      position:absolute;top:0;left:0;right:0;height:56px;background:rgba(255,255,255,0.96);
      display:flex;align-items:center;gap:8px;padding:8px 12px;z-index:1000000;box-shadow:0 2px 8px rgba(0,0,0,0.15);
    `;

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.style.cssText = 'font-weight:600;';
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Назад в приложение';
    backBtn.onclick = () => {
      this.clearGameQuizCycle(containerId);
      gameContainer.remove();
    };

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;color:#333;';
    title.textContent = 'Игротека';

    header.appendChild(backBtn);
    header.appendChild(title);

    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.onlinegames.io/';
    iframe.style.cssText = 'position:absolute;top:56px;left:0;width:100%;height:calc(100% - 56px);border:none;';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

    gameContainer.appendChild(header);
    gameContainer.appendChild(iframe);
    document.body.appendChild(gameContainer);

    this.startGameQuizCycle(containerId);
    setTimeout(() => this.showOverlayQuiz(containerId), 1000);
  }

  // Periodic quiz management
  startGameQuizCycle(containerId) {
    this.clearGameQuizCycle(containerId);
    const QUIZ_DELAY = 5 * 60 * 1000; // 5 minutes
    const WARNING_DELAY = 15 * 1000; // 15 seconds

    const schedule = () => {
      const warningTimeoutId = setTimeout(() => {
        this.showNotification('⚠️ Через 15 секунд появится quiz! Поставьте игру на паузу!', 'warning');
      }, QUIZ_DELAY - WARNING_DELAY);

      const quizTimeoutId = setTimeout(() => {
        this.showOverlayQuiz(containerId);
        schedule();
      }, QUIZ_DELAY);

      this.gameQuizIntervals[containerId] = { warningTimeoutId, quizTimeoutId };
    };

    schedule();
  }
  clearGameQuizCycle(containerId) {
    const timers = this.gameQuizIntervals[containerId];
    if (timers) {
      clearTimeout(timers.warningTimeoutId);
      clearTimeout(timers.quizTimeoutId);
      delete this.gameQuizIntervals[containerId];
    }
  }

  // Overlay quiz used by any game container
  showOverlayQuiz(containerId) {
    const host = document.getElementById(containerId);
    if (!host) return;

    const overlay = document.createElement('div');
    overlay.className = 'game-quiz-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000001;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;padding:20px;';

    const quizBox = document.createElement('div');
    quizBox.style.cssText = 'background:var(--bg-primary);border-radius:16px;padding:30px;max-width:520px;width:90%;box-shadow:var(--shadow-lg);';

    const title = document.createElement('h2');
    title.textContent = 'Время повторить слова!';
    title.style.cssText = 'text-align:center;margin-bottom:20px;color:var(--text-primary);';

    const quizContent = document.createElement('div');
    quizContent.id = `overlayQuizContent_${containerId}`;

    quizBox.appendChild(title);
    quizBox.appendChild(quizContent);
    overlay.appendChild(quizBox);
    host.appendChild(overlay);

    let quizCorrect = 0;
    const showQuestion = () => {
      const word = this.getRandomLearningWord();
      if (!word) {
        quizContent.innerHTML = '<div style="text-align:center;color:var(--text-secondary);">Недостаточно слов</div>';
        return;
      }
      const direction = Math.random() < 0.5 ? 'EN_RU' : 'RU_EN';
      const questionText = direction === 'EN_RU' ? this.getEnglishDisplay(word) : word.translation;
      const correct = direction === 'EN_RU' ? word.translation : this.getEnglishDisplay(word);
      const options = this.buildQuizOptions(word, direction);
      const shuffled = this.shuffle(options);

      quizContent.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:12px;">
            ${questionText}
            <span class="sound-actions" style="margin-left:8px;">
              <button class="mini-btn" title="US" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'us')"><i class="fas fa-volume-up"></i></button>
              <button class="mini-btn" title="UK" onclick="app.playWord('${this.safeAttr(word.word)}', ${word.forms ? JSON.stringify(word.forms).replace(/"/g, '&quot;') : 'null'}, 'uk')"><i class="fas fa-headphones"></i></button>
            </span>
          </div>
          <div style="font-size:14px;color:var(--text-secondary);margin-bottom:10px;">Выбрано правильных: ${quizCorrect}/4</div>
          <div class="quiz-options" style="display:grid;gap:10px;">
            ${shuffled.map(opt => {
              const isEnglishOpt = this.isEnglish(opt) && !this.isRussian(opt);
              const baseForSound = opt.split('→')[0].trim();
              const soundBtns = isEnglishOpt ? `
                <span class="option-sound">
                  <button class="mini-btn" title="US" onclick="event.stopPropagation(); app.playSingleWordMp3('${this.safeAttr(baseForSound)}', 'us')"><i class="fas fa-volume-up"></i></button>
                  <button class="mini-btn" title="UK" onclick="event.stopPropagation(); app.playSingleWordMp3('${this.safeAttr(baseForSound)}', 'uk')"><i class="fas fa-headphones"></i></button>
                </span>
              ` : '';
              return `<div class="quiz-option-gate" data-answer="${this.safeAttr(opt)}" style="padding:12px;border-radius:8px;border:2px solid var(--border-color);background:var(--bg-secondary);cursor:pointer;text-align:center;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span>${opt}</span>${soundBtns}
              </div>`;
            }).join('')}
          </div>
        </div>
      `;

      if (direction === 'EN_RU') {
        setTimeout(() => {
          if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
          else this.playSingleWordMp3(word.word, 'us');
        }, 150);
      }

      quizContent.querySelectorAll('.quiz-option-gate').forEach(opt => {
        opt.addEventListener('click', () => {
          const chosen = opt.getAttribute('data-answer');
          const isCorrect = chosen === correct;

          opt.style.background = isCorrect ? '#d1fae5' : '#fee2e2';
          opt.style.borderColor = isCorrect ? '#10b981' : '#ef4444';

          if (!isCorrect) {
            quizContent.querySelectorAll('.quiz-option-gate').forEach(o => {
              if (o.getAttribute('data-answer') === correct) {
                o.style.background = '#d1fae5';
                o.style.borderColor = '#10b981';
              }
            });
          }

          if (direction === 'RU_EN') {
            setTimeout(() => {
              if (word.forms && word.forms.length) this.playFormsSequence(word.forms, 'us');
              else this.playSingleWordMp3(word.word, 'us');
            }, 200);
          }

          if (isCorrect) {
            quizCorrect++;
            this.recordDailyProgress();

            if (quizCorrect >= 4) {
              setTimeout(() => {
                overlay.remove();
                this.showNotification('Отлично! Продолжайте играть!', 'success');
              }, 600);
            } else {
              setTimeout(() => showQuestion(), 500);
            }
          } else {
            setTimeout(() => showQuestion(), 800);
          }
        });
      });
    };
    showQuestion();
  }

  // =========
  // CSS & misc
  // =========
  static injectStylesOnce() {
    if (document.getElementById('app-extra-styles')) return;
    const style = document.createElement('style');
    style.id = 'app-extra-styles';
    style.textContent = `
      @keyframes slideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      @keyframes slideUp { from { transform: translate(-50%, 0); opacity: 1; } to { transform: translate(-50%, -100%); opacity: 0; } }

      .game-iframe-fullscreen { position: fixed; inset: 0; z-index: 999999; background: #000; }
      .game-back-btn { position: absolute; top: 10px; left: 10px; z-index: 1000000; background: rgba(255, 255, 255, 0.9); border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; color: #333; }

      .games-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
      .game-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-xl); overflow: hidden; transition: all 0.2s ease; }
      .game-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
      .game-cover { width: 100%; height: 180px; object-fit: cover; background: var(--bg-tertiary); }
      .game-info { padding: 1rem; }
      .game-info h3 { margin-bottom: 0.5rem; color: var(--text-primary); }
      .game-info p { color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem; }

      .sound-actions .mini-btn, .option-sound .mini-btn {
        border:none; background: var(--bg-tertiary, #f0f2f5); padding:4px 6px; border-radius:6px; cursor:pointer; color:#333;
      }
      .quiz-option .quiz-option-inner { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    `;
    document.head.appendChild(style);
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const icon = document.querySelector('#themeToggle i');
  if (icon) {
    icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }

  EnglishWordsApp.injectStylesOnce();
  window.app = new EnglishWordsApp();
});
