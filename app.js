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
    this.loadData();
    this.initializeUI();
    this.renderProgress();
  }

  initializeUI() {
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', e => {
        const section = e.currentTarget.getAttribute('data-section');
        this.switchSection(section);
      });
    });
    document.querySelectorAll('.level-card[data-level]').forEach(card => {
      card.addEventListener('click', e => {
        const level = e.currentTarget.getAttribute('data-level');
        this.showLevelWords(level);
      });
    });
    document.querySelectorAll('.level-card[data-category]').forEach(card => {
      card.addEventListener('click', e => {
        const cat = e.currentTarget.getAttribute('data-category');
        this.showCategoryWords(cat);
      });
    });
    document.getElementById('backToLevels')?.addEventListener('click', () => this.backToLevels());
    document.getElementById('addWordBtn')?.addEventListener('click', () => this.addSingleWord());
    document.getElementById('bulkAddBtn')?.addEventListener('click', () => this.bulkAddWords());
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        this.currentMode = e.currentTarget.getAttribute('data-mode');
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderLearningSection();
      });
    });
    document.querySelectorAll('.practice-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        this.currentPractice = e.currentTarget.getAttribute('data-practice');
        document.querySelectorAll('.practice-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderLearningSection();
      });
    });
    document.getElementById('addAllLevelBtn')?.addEventListener('click', () => this.addAllLevelWords());
    document.getElementById('removeAllLevelBtn')?.addEventListener('click', () => this.removeAllLevelWords());
    document.getElementById('raceStartBtn')?.addEventListener('click', () => this.showQuizGateForGame('Race'));
    document.getElementById('dashStartBtn')?.addEventListener('click', () => this.showQuizGateForGame('Dash'));
    document.getElementById('game2048StartBtn')?.addEventListener('click', () => this.showQuizGateForGame('2048'));
    this.updateLevelCounts();
    this.renderLearningSection();
    this.renderCustomWords();
  }

  showQuizGateForGame(gameName) {
    if ((this.learningWords || []).filter(w => !w.isLearned).length < 4) {
      this.showNotification('Чтобы играть, добавьте минимум 4 слова в «Изучаю»', 'warning');
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'gameQuizOverlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: 0, zIndex: 999999,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    });
    
    const gameContainer = document.createElement('div');
    Object.assign(gameContainer.style, {
      background: 'rgba(255,255,255,0.95)', borderRadius: '16px', 
      padding: '20px', maxWidth: '400px', width: '90%',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
    });
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Закрыть';
    closeBtn.className = 'btn btn-secondary';
    closeBtn.style.marginBottom = '10px';
    closeBtn.onclick = () => overlay.remove();
                if (gameName === '2048') { /* Game placeholder */ }
    
    const gameTitle = document.createElement('h2');
    gameTitle.textContent = `${gameName} Quiz Gate`;
    gameTitle.style.textAlign = 'center';
    gameTitle.style.marginBottom = '20px';
    gameTitle.style.color = '#333';
    
    const quizContainer = document.createElement('div');
    quizContainer.id = 'quizGateContainer';
    
    const scoreDisplay = document.createElement('div');
    scoreDisplay.id = 'scoreGateDisplay';
    scoreDisplay.style.textAlign = 'center';
    scoreDisplay.style.fontSize = '18px';
    scoreDisplay.style.fontWeight = 'bold';
    scoreDisplay.style.marginTop = '15px';
    scoreDisplay.style.color = '#667eea';
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
      const questionText = direction === 'EN_RU' ? word.word : word.translation;
      const correct = direction === 'EN_RU' ? word.translation : word.word;
      const options = this.buildQuizOptions(word, direction);
      const shuffled = this.shuffle(options);
      
      quizContainer.innerHTML = `
        <div style="margin-bottom:15px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#333;margin-bottom:15px;">
            ${questionText}
          </div>
          <div style="font-size:14px;color:#666;margin-bottom:15px;">
            Выберите правильный вариант
          </div>
          <div class="quiz-options" style="display:grid;gap:10px;">
            ${shuffled.map(opt => `
              <div class="quiz-option-gate" data-answer="${this.safeAttr(opt)}" 
                   style="padding:12px;border-radius:8px;border:2px solid #e0e0e0;background:#f9f9f9;cursor:pointer;text-align:center;font-weight:600;transition:all 0.2s;">
                ${opt}
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
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
          
          if (isCorrect) {
            correctCount++;
            document.getElementById('gateScore').textContent = correctCount;
            this.recordDailyProgress();
            
            if (correctCount >= 3) {
              setTimeout(() => {
                overlay.remove();
                if (gameName === '2048') { /* Game placeholder */ }
                this.showNotification(`Отлично! Запуск игры ${gameName}!`, 'success');
              }, 800);
            } else {
              setTimeout(() => showNextQuestion(), 600);
            }
          } else {
            setTimeout(() => showNextQuestion(), 1000);
          }
        });
      });
    };
    
    showNextQuestion();
  }

  switchSection(section) {
    this.currentSection = section;
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelector(`#${section}`)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
    if (section === 'levels') this.backToLevels();
    if (section === 'learning') this.renderLearningSection();
    if (section === 'progress') this.renderProgress();
  }

  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('theme', newTheme);
  }

  updateLevelCounts() {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    levels.forEach(lv => {
      const count = (oxfordWordsDatabase[lv] || []).length;
      const card = document.querySelector(`[data-level="${lv}"] .word-count`);
      if (card) card.textContent = `${count} слов`;
    });
    const irregCount = this.getIrregularVerbs().length;
    const prepCount = this.getPrepositions().length;
    const irregCard = document.querySelector('[data-category="IRREGULARS"] .word-count');
    const prepCard = document.querySelector('[data-category="PREPOSITIONS"] .word-count');
    if (irregCard) irregCard.textContent = `${irregCount} слов`;
    if (prepCard) prepCard.textContent = `${prepCount} слов`;
  }

  showLevelWords(level) {
    this.currentLevel = level;
    this.currentCategory = null;
    const words = oxfordWordsDatabase[level] || [];
    const levelsGrid = document.getElementById('levelsGrid');
    const categoriesGrid = document.getElementById('categoriesGrid');
    const container = document.getElementById('wordsContainer');
    const title = document.getElementById('currentLevelTitle');
    const list = document.getElementById('wordsList');
    
    if (levelsGrid) levelsGrid.style.display = 'none';
    if (categoriesGrid && categoriesGrid.previousElementSibling) {
      categoriesGrid.previousElementSibling.style.display = 'none';
      categoriesGrid.style.display = 'none';
    }
    if (container) container.classList.remove('hidden');
    if (title) title.textContent = `${level} (${words.length} слов)`;
    if (list) {
      list.innerHTML = words.map(w => this.renderWordCard(w, level)).join('');
      this.attachWordCardListeners();
    }
  }

  showCategoryWords(cat) {
    this.currentCategory = cat;
    this.currentLevel = null;
    const words = cat === 'IRREGULARS' ? this.getIrregularVerbs() : this.getPrepositions();
    const levelsGrid = document.getElementById('levelsGrid');
    const categoriesGrid = document.getElementById('categoriesGrid');
    const container = document.getElementById('wordsContainer');
    const title = document.getElementById('currentLevelTitle');
    const list = document.getElementById('wordsList');
    
    if (levelsGrid) levelsGrid.style.display = 'none';
    if (categoriesGrid && categoriesGrid.previousElementSibling) {
      categoriesGrid.previousElementSibling.style.display = 'none';
      categoriesGrid.style.display = 'none';
    }
    if (container) container.classList.remove('hidden');
    if (title) title.textContent = `${cat} (${words.length} слов)`;
    if (list) {
      list.innerHTML = words.map(w => this.renderWordCard(w, cat)).join('');
      this.attachWordCardListeners();
    }
  }

  backToLevels() {
    this.currentLevel = null;
    this.currentCategory = null;
    const levelsGrid = document.getElementById('levelsGrid');
    const categoriesGrid = document.getElementById('categoriesGrid');
    const container = document.getElementById('wordsContainer');
    
    if (levelsGrid) levelsGrid.style.display = 'grid';
    if (categoriesGrid && categoriesGrid.previousElementSibling) {
      categoriesGrid.previousElementSibling.style.display = 'flex';
      categoriesGrid.style.display = 'grid';
    }
    if (container) container.classList.add('hidden');
  }

  renderWordCard(word, level) {
    const isLearning = this.learningWords.some(w => w.word === word.word && w.level === level);
    return `
      <div class="word-card">
        <div class="word-header">
          <div>
            <div class="word-text">${word.word}</div>
            <div class="word-translation">${word.translation}</div>
          </div>
          <div class="word-actions">
            <button class="action-btn play-btn" onclick="app.playAudio('${word.word}')" title="Произношение">
              <i class="fas fa-volume-up"></i>
            </button>
            ${isLearning ? 
              `<button class="action-btn remove-btn" onclick="app.removeFromLearning('${this.escapeHtml(word.word)}', '${level}')" title="Удалить">
                <i class="fas fa-trash"></i>
              </button>` :
              `<button class="action-btn add-btn" onclick="app.addToLearning('${this.escapeHtml(word.word)}', '${level}')" title="Добавить">
                <i class="fas fa-plus"></i>
              </button>`
            }
          </div>
        </div>
        <span class="word-level">${level}</span>
      </div>`;
  }

  escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  attachWordCardListeners() {}

  addToLearning(word, level) {
    const source = this.currentCategory || level;
    let wordData;
    if (this.currentCategory === 'IRREGULARS') wordData = this.getIrregularVerbs().find(w => w.word === word);
    else if (this.currentCategory === 'PREPOSITIONS') wordData = this.getPrepositions().find(w => w.word === word);
    else wordData = (oxfordWordsDatabase[level] || []).find(w => w.word === word);
    if (!wordData) return;
    const exists = this.learningWords.some(w => w.word === word && w.level === source);
    if (!exists) {
      this.learningWords.push({ ...wordData, level: source, isLearned: false, nextReview: Date.now() });
      this.saveData();
      this.showNotification('Слово добавлено в «Изучаю»', 'success');
      this.renderLearningSection();
      if (this.currentLevel) this.showLevelWords(this.currentLevel);
      if (this.currentCategory) this.showCategoryWords(this.currentCategory);
    }
  }

  removeFromLearning(word, level) {
    this.learningWords = this.learningWords.filter(w => !(w.word === word && w.level === level));
    this.saveData();
    this.showNotification('Слово удалено из «Изучаю»', 'warning');
    this.renderLearningSection();
    if (this.currentLevel) this.showLevelWords(this.currentLevel);
    if (this.currentCategory) this.showCategoryWords(this.currentCategory);
  }

  addAllLevelWords() {
    const source = this.currentCategory || this.currentLevel;
    if (!source) return;
    let words = [];
    if (this.currentCategory === 'IRREGULARS') words = this.getIrregularVerbs();
    else if (this.currentCategory === 'PREPOSITIONS') words = this.getPrepositions();
    else words = oxfordWordsDatabase[this.currentLevel] || [];
    let added = 0;
    words.forEach(w => {
      const exists = this.learningWords.some(lw => lw.word === w.word && lw.level === source);
      if (!exists) {
        this.learningWords.push({ ...w, level: source, isLearned: false, nextReview: Date.now() });
        added++;
      }
    });
    this.saveData();
    this.showNotification(`Добавлено слов: ${added}`, 'success');
    this.renderLearningSection();
    if (this.currentLevel) this.showLevelWords(this.currentLevel);
    if (this.currentCategory) this.showCategoryWords(this.currentCategory);
  }

  removeAllLevelWords() {
    const source = this.currentCategory || this.currentLevel;
    if (!source) return;
    const before = this.learningWords.length;
    this.learningWords = this.learningWords.filter(w => w.level !== source);
    const removed = before - this.learningWords.length;
    this.saveData();
    this.showNotification(`Удалено слов: ${removed}`, 'warning');
    this.renderLearningSection();
    if (this.currentLevel) this.showLevelWords(this.currentLevel);
    if (this.currentCategory) this.showCategoryWords(this.currentCategory);
  }

  addSingleWord() {
    const word = document.getElementById('newWord')?.value.trim();
    const trans = document.getElementById('newTranslation')?.value.trim();
    const level = document.getElementById('newLevel')?.value || 'A1';
    if (!word || !trans) {
      this.showNotification('Заполните слово и перевод', 'warning');
      return;
    }
    const newWord = { word, translation: trans, level, category: 'custom', isLearned: false, nextReview: Date.now() };
    this.customWords.push(newWord);
    this.learningWords.push(newWord);
    this.saveData();
    this.showNotification('Слово добавлено в словарь и «Изучаю»', 'success');
    document.getElementById('newWord').value = '';
    document.getElementById('newTranslation').value = '';
    this.renderCustomWords();
    this.renderLearningSection();
  }

  bulkAddWords() {
    const text = document.getElementById('bulkTextarea')?.value.trim();
    const level = document.getElementById('bulkLevel')?.value || 'A1';
    if (!text) {
      this.showNotification('Введите текст', 'warning');
      return;
    }
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0;
    lines.forEach(line => {
      if (line.includes(' - ')) {
        const [eng, ru] = line.split(' - ').map(p => p.trim());
        if (eng && ru) {
          const newWord = { word: eng, translation: ru, level, category: 'custom', isLearned: false, nextReview: Date.now() };
          this.customWords.push(newWord);
          this.learningWords.push(newWord);
          added++;
        }
      }
    });
    this.saveData();
    this.showNotification(`Добавлено слов: ${added}`, 'success');
    document.getElementById('bulkTextarea').value = '';
    this.renderCustomWords();
    this.renderLearningSection();
  }

  renderCustomWords() {
    const container = document.getElementById('customWords');
    if (!container) return;
    if (!this.customWords.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-plus-circle"></i>
          <h3>Нет добавленных слов</h3>
          <p>Используйте формы выше для добавления новых слов</p>
        </div>`;
      return;
    }
    container.innerHTML = this.customWords.map((w, i) => `
      <div class="word-card">
        <div class="word-header">
          <div>
            <div class="word-text">${w.word}</div>
            <div class="word-translation">${w.translation}</div>
          </div>
          <div class="word-actions">
            <button class="action-btn play-btn" onclick="app.playAudio('${w.word}')">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="action-btn remove-btn" onclick="app.deleteCustomWord(${i})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <span class="word-level">${w.level}</span>
      </div>`).join('');
  }

  deleteCustomWord(index) {
    const word = this.customWords[index];
    this.customWords.splice(index, 1);
    this.learningWords = this.learningWords.filter(w => !(w.word === word.word && w.category === 'custom'));
    this.saveData();
    this.showNotification('Слово удалено', 'warning');
    this.renderCustomWords();
    this.renderLearningSection();
  }

  renderLearningSection() {
    const container = document.getElementById('learningWordsList');
    const countEl = document.getElementById('learningCount');
    
    let activeWords = this.learningWords;
    if (this.currentPractice === 'scheduled') {
      activeWords = this.learningWords.filter(w => !w.isLearned && (!w.nextReview || w.nextReview <= Date.now()));
    }
    
    if (countEl) countEl.textContent = `${activeWords.length} слов`;
    if (!container) return;
    if (!this.learningWords.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-book-open"></i>
          <h3>Пока нет слов для изучения</h3>
          <p>Добавьте слова из списка по уровням или создайте новые</p>
        </div>`;
      return;
    }
    if (this.currentMode === 'list') {
      this.renderListMode(container);
    } else if (this.currentMode === 'flashcards') {
      this.renderFlashcardsMode(container);
    } else if (this.currentMode === 'quiz') {
      this.renderQuizMode(container);
    }
  }

  renderListMode(container) {
    let words = this.learningWords;
    if (this.currentPractice === 'scheduled') {
      words = words.filter(w => !w.isLearned && (!w.nextReview || w.nextReview <= Date.now()));
    }
    if (!words.length) {
      container.innerHTML = `<div class="empty-state"><h3>Все слова изучены!</h3><p>Возвращайтесь завтра для повторения</p></div>`;
      return;
    }
    const html = `
      <div class="all-words-container">
        <div class="all-words-header">
          <div class="all-words-title">Все слова (${words.length})</div>
          <div class="words-filter">
            <button class="filter-btn ${this.showFilter === 'all' ? 'active' : ''}" onclick="app.setFilter('all')">Все</button>
            <button class="filter-btn ${this.showFilter === 'learned' ? 'active' : ''}" onclick="app.setFilter('learned')">Изучены</button>
            <button class="filter-btn ${this.showFilter === 'learning' ? 'active' : ''}" onclick="app.setFilter('learning')">Изучаю</button>
          </div>
        </div>
        <div class="learning-words-grid">
          ${words.filter(w => {
            if (this.showFilter === 'all') return true;
            if (this.showFilter === 'learned') return w.isLearned;
            if (this.showFilter === 'learning') return !w.isLearned;
            return true;
          }).map(w => this.renderLearningWordCard(w)).join('')}
        </div>
      </div>`;
    container.innerHTML = html;
  }

  setFilter(filter) {
    this.showFilter = filter;
    this.renderLearningSection();
  }

  renderLearningWordCard(word) {
    const stats = this.wordStats[word.word] || { correct: 0, total: 0, difficulty: 0 };
    const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    return `
      <div class="learning-word-card ${word.isLearned ? 'learned' : ''}">
        <div class="learning-word-header">
          <div>
            <div class="learning-word-text">${word.word}</div>
            <div class="learning-word-translation">${word.translation}</div>
          </div>
          <button class="action-btn play-btn" onclick="app.playAudio('${word.word}')">
            <i class="fas fa-volume-up"></i>
          </button>
        </div>
        <div class="learning-word-meta">
          <div class="word-progress">
            <span>Точность: ${acc}%</span>
            <div class="progress-indicator">
              <div class="progress-fill-mini" style="width:${acc}%"></div>
            </div>
          </div>
          <div class="word-level-info">
            <span class="word-level">${word.level}</span>
          </div>
        </div>
      </div>`;
  }

  getRandomImageNumber() {
    return Math.floor(Math.random() * 100) + 1;
  }

  renderFlashcardsMode(container) {
    let words = this.learningWords;
    if (this.currentPractice === 'scheduled') {
      words = words.filter(w => !w.isLearned && (!w.nextReview || w.nextReview <= Date.now()));
    }
    if (!words.length) {
      container.innerHTML = `<div class="empty-state"><h3>Все слова изучены!</h3><p>Возвращайтесь завтра для повторения</p></div>`;
      return;
    }
    const word = words[this.currentReviewIndex % words.length];
    const imgNum = this.getRandomImageNumber();
    const imgUrl = `${imgNum}.jpg`;
    container.innerHTML = `
      <div class="review-container">
        <div class="review-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${((this.currentReviewIndex + 1) / words.length) * 100}%"></div>
          </div>
          <div class="progress-text">${this.currentReviewIndex + 1} / ${words.length}</div>
        </div>
        <div class="flashcard" id="flashcardEl">
          <img src="${imgUrl}" alt="${word.word}" class="flashcard-image" onerror="this.src='nophoto.jpg'">
          <div class="flashcard-body">
            <div class="flashcard-title">${word.word}</div>
            <div class="flashcard-subtitle" style="display:none;" id="flashcardAnswer">${word.translation}</div>
            <button class="btn btn-primary" onclick="app.showFlashcardAnswer()">Показать ответ</button>
          </div>
        </div>
        <div class="review-controls">
          <button class="btn btn-secondary" onclick="app.prevFlashcard()">
            <i class="fas fa-arrow-left"></i> Назад
          </button>
          <button class="btn btn-success" onclick="app.markAsLearned('${word.word}')">
            <i class="fas fa-check"></i> Выучено
          </button>
          <button class="btn btn-secondary" onclick="app.nextFlashcard()">
            Далее <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>`;
  }

  showFlashcardAnswer() {
    const answer = document.getElementById('flashcardAnswer');
    if (answer) answer.style.display = 'block';
  }

  prevFlashcard() {
    this.currentReviewIndex = Math.max(0, this.currentReviewIndex - 1);
    this.renderLearningSection();
  }

  nextFlashcard() {
    this.currentReviewIndex++;
    this.renderLearningSection();
  }

  markAsLearned(word) {
    const w = this.learningWords.find(lw => lw.word === word);
    if (w) {
      w.isLearned = true;
      w.nextReview = Date.now() + (7 * 24 * 60 * 60 * 1000);
      this.recordDailyProgress();
      this.saveData();
      this.showNotification('Слово отмечено как выученное!', 'success');
      this.nextFlashcard();
    }
  }

  renderQuizMode(container) {
    let words = this.learningWords;
    if (this.currentPractice === 'scheduled') {
      words = words.filter(w => !w.isLearned && (!w.nextReview || w.nextReview <= Date.now()));
    }
    if (!words.length) {
      container.innerHTML = `<div class="empty-state"><h3>Все слова изучены!</h3><p>Возвращайтесь завтра для повторения</p></div>`;
      return;
    }
    const word = words[this.currentReviewIndex % words.length];
    const direction = Math.random() < 0.5 ? 'EN_RU' : 'RU_EN';
    const questionText = direction === 'EN_RU' ? word.word : word.translation;
    const correctAnswer = direction === 'EN_RU' ? word.translation : word.word;
    const options = this.buildQuizOptions(word, direction);
    const shuffled = this.shuffle(options);
    const showAudio = direction === 'EN_RU';
    const imgNum = this.getRandomImageNumber();
    const imgUrl = `${imgNum}.jpg`;
    container.innerHTML = `
      <div class="review-container">
        <div class="review-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${((this.currentReviewIndex + 1) / words.length) * 100}%"></div>
          </div>
          <div class="progress-text">${this.currentReviewIndex + 1} / ${words.length}</div>
        </div>
        <div class="quiz-container">
          <img src="${imgUrl}" alt="Quiz image" class="quiz-image" onerror="this.src='nophoto.jpg'">
          <div class="quiz-question">${questionText} ${showAudio ? `<button class="action-btn play-btn" onclick="app.playAudio('${word.word}')" style="margin-left:10px;"><i class="fas fa-volume-up"></i></button>` : ''}</div>
          <div class="quiz-sub">Выберите правильный вариант</div>
          <div class="quiz-options" id="quizOptions">
            ${shuffled.map(opt => `<div class="quiz-option" data-answer="${this.safeAttr(opt)}">${opt}</div>`).join('')}
          </div>
        </div>
        <div class="review-controls">
          <button class="btn btn-secondary" onclick="app.prevQuiz()">
            <i class="fas fa-arrow-left"></i> Назад
          </button>
          <button class="btn btn-secondary" onclick="app.nextQuiz()">
            Далее <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>`;
    setTimeout(() => {
      document.querySelectorAll('#quizOptions .quiz-option').forEach(opt => {
        opt.addEventListener('click', () => this.handleQuizAnswer(opt, correctAnswer, word.word, direction));
      });
    }, 0);
  }

  buildQuizOptions(word, direction) {
    const correct = direction === 'EN_RU' ? word.translation : word.word;
    const pool = [...this.learningWords, ...this.customWords];
    const others = pool.filter(w => w.word !== word.word).map(w => direction === 'EN_RU' ? w.translation : w.word);
    const unique = [...new Set(others)];
    const distractors = [];
    while (distractors.length < 3 && unique.length > 0) {
      const idx = Math.floor(Math.random() * unique.length);
      distractors.push(unique.splice(idx, 1)[0]);
    }
    return [correct, ...distractors];
  }

  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  handleQuizAnswer(optEl, correct, wordText, direction) {
    const chosen = optEl.getAttribute('data-answer');
    const isCorrect = chosen === correct;
    optEl.classList.add(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
      document.querySelectorAll('#quizOptions .quiz-option').forEach(o => {
        if (o.getAttribute('data-answer') === correct) o.classList.add('correct');
      });
    } else {
      if (direction === 'RU_EN') {
        this.playAudio(wordText);
      }
    }
    this.updateStats(wordText, isCorrect);
    if (isCorrect) this.recordDailyProgress();
    setTimeout(() => this.nextQuiz(), 1000);
  }

  prevQuiz() {
    this.currentReviewIndex = Math.max(0, this.currentReviewIndex - 1);
    this.renderLearningSection();
  }

  nextQuiz() {
    this.currentReviewIndex++;
    this.renderLearningSection();
  }

  updateStats(word, isCorrect) {
    if (!this.wordStats[word]) {
      this.wordStats[word] = { correct: 0, total: 0, difficulty: 0 };
    }
    this.wordStats[word].total++;
    if (isCorrect) this.wordStats[word].correct++;
    this.saveData();
  }

  safeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  playAudio(word, accent = 'uk') {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    const buttons = document.querySelectorAll(`button[onclick*="playAudio('${word}')"]`);
    buttons.forEach(btn => {
      btn.disabled = true;
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = 'fas fa-spinner fa-spin';
      }
    });
    
    const ukUrl = `https://wooordhunt.ru/data/sound/sow/uk/${cleanWord}.mp3`;
    const usUrl = `https://wooordhunt.ru/data/sound/sow/us/${cleanWord}.mp3`;
    
    this.tryPlayAudio(ukUrl)
      .then(() => {
        this.showNotification('Воспроизведение UK акцента', 'success');
      })
      .catch(() => {
        return this.tryPlayAudio(usUrl)
          .then(() => {
            this.showNotification('Воспроизведение US акцента', 'success');
          })
          .catch(() => {
            this.showNotification('Аудио для этого слова недоступно', 'warning');
          });
      })
      .finally(() => {
        buttons.forEach(btn => {
          btn.disabled = false;
          const icon = btn.querySelector('i');
          if (icon) {
            icon.className = 'fas fa-volume-up';
          }
        });
      });
  }

  tryPlayAudio(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Timeout'));
        }
      }, 8000);
      
      audio.oncanplaythrough = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          audio.play()
            .then(() => resolve())
            .catch(() => reject(new Error('Play failed')));
        }
      };
      
      audio.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('Load error'));
        }
      };
      
      audio.src = url;
      audio.load();
    });
  }

  getCurrentWeekDay() {
    const now = new Date();
    const day = now.getDay();
    return day === 0 ? 6 : day - 1;
  }

  getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart.getTime();
  }

  recordDailyProgress() {
    const weekStart = this.getWeekStart();
    const dayIndex = this.getCurrentWeekDay();
    
    if (!this.weeklyProgress.length || this.weeklyProgress[0].weekStart !== weekStart) {
      this.weeklyProgress = [{ weekStart, days: [0,0,0,0,0,0,0] }];
    }
    
    this.weeklyProgress[0].days[dayIndex]++;
    this.saveData();
  }

  getWeeklyProgressData() {
    const weekStart = this.getWeekStart();
    
    if (!this.weeklyProgress.length || this.weeklyProgress[0].weekStart !== weekStart) {
      return [0,0,0,0,0,0,0];
    }
    
    return this.weeklyProgress[0].days;
  }

  renderProgress() {
    const container = document.getElementById('progressContent');
    if (!container) return;
    const learned = this.learningWords.filter(w => w.isLearned).length;
    const total = this.learningWords.length;
    const percent = total > 0 ? Math.round((learned / total) * 100) : 0;
    const weeklyData = this.getWeeklyProgressData();
    const overallData = this.getOverallProgress();
    container.innerHTML = `
      <div class="progress-card">
        <h3>Общий прогресс</h3>
        <div class="progress-row">
          <span>Изучено слов</span>
          <span>${learned} / ${total}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${percent}%"></div>
        </div>
      </div>
      <div class="progress-card">
        <h3>Недельный прогресс</h3>
        <div style="height:200px;background:var(--bg-tertiary);border-radius:8px;display:flex;align-items:flex-end;padding:10px;gap:4px;">
          ${weeklyData.map((val, i) => {
            const maxVal = Math.max(...weeklyData, 1);
            const height = val > 0 ? Math.max(10, (val / maxVal) * 180) : 10;
            const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            const isToday = i === this.getCurrentWeekDay();
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
              <div style="font-size:11px;margin-bottom:4px;font-weight:${isToday ? 'bold' : 'normal'};">${val}</div>
              <div style="width:100%;background:linear-gradient(to top,var(--primary-color),var(--accent-color));border-radius:4px;height:${height}px;opacity:${val > 0 ? 1 : 0.3};"></div>
              <div style="font-size:10px;margin-top:4px;color:var(--text-secondary);font-weight:${isToday ? 'bold' : 'normal'};">${days[i]}</div>
            </div>`;
          }).join('')}
        </div>
        <p style="margin-top:10px;font-size:12px;color:var(--text-secondary);text-align:center;">
          Слова изучены на этой неделе: ${weeklyData.reduce((a,b) => a+b, 0)}
        </p>
      </div>
      <div class="progress-card">
        <h3>Динамика обучения</h3>
        <div style="height:200px;background:var(--bg-tertiary);border-radius:8px;display:flex;align-items:flex-end;padding:10px;gap:4px;">
          ${overallData.map((val, i) => {
            const height = val > 0 ? Math.max(10, (val / Math.max(...overallData, 1)) * 180) : 0;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
              <div style="width:100%;background:linear-gradient(to top,var(--primary-color),var(--accent-color));border-radius:4px;height:${height}px;"></div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  getOverallProgress() {
    const total = this.learningWords.length;
    const learned = this.learningWords.filter(w => w.isLearned).length;
    const data = [];
    for (let i = 0; i < 10; i++) {
      data.push(Math.floor((learned / 10) * (i + 1)));
    }
    return data;
  }

  getIrregularVerbs() {
    return [
      { word: 'be', translation: 'быть, находиться', pos: 'v.' },
      { word: 'have', translation: 'иметь', pos: 'v.' },
      { word: 'do', translation: 'делать', pos: 'v.' },
      { word: 'go', translation: 'идти, ехать', pos: 'v.' },
      { word: 'get', translation: 'получать', pos: 'v.' },
      { word: 'make', translation: 'делать, создавать', pos: 'v.' },
      { word: 'see', translation: 'видеть', pos: 'v.' },
      { word: 'know', translation: 'знать', pos: 'v.' },
      { word: 'take', translation: 'брать', pos: 'v.' },
      { word: 'come', translation: 'приходить', pos: 'v.' }
    ];
  }

  getPrepositions() {
    return [
      { word: 'in', translation: 'в, внутри', pos: 'prep.' },
      { word: 'on', translation: 'на', pos: 'prep.' },
      { word: 'at', translation: 'у, в, на', pos: 'prep.' },
      { word: 'by', translation: 'у, около, к', pos: 'prep.' },
      { word: 'for', translation: 'для, за', pos: 'prep.' },
      { word: 'with', translation: 'с', pos: 'prep.' },
      { word: 'about', translation: 'о, около', pos: 'prep.' },
      { word: 'from', translation: 'из, от', pos: 'prep.' },
      { word: 'to', translation: 'к, в, на', pos: 'prep.' },
      { word: 'of', translation: 'из, о', pos: 'prep.' }
    ];
  }

  getRandomLearningWord() {
    const pool = (this.learningWords || []).filter(w => !w.isLearned);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `toast ${type}`;
    notif.textContent = message;
    notif.style.cssText = `position:fixed;top:80px;right:20px;background:var(--bg-secondary);color:var(--text-primary);padding:12px 20px;border-radius:12px;box-shadow:var(--shadow-lg);z-index:9999;border:1px solid var(--border-color);max-width:300px;`;
    if (type === 'success') notif.style.borderLeft = '4px solid var(--accent-color)';
    if (type === 'warning') notif.style.borderLeft = '4px solid var(--warning-color)';
    if (type === 'error') notif.style.borderLeft = '4px solid var(--danger-color)';
    if (type === 'info') notif.style.borderLeft = '4px solid var(--primary-color)';
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
  }

  saveData() {
    localStorage.setItem('learningWords', JSON.stringify(this.learningWords));
    localStorage.setItem('customWords', JSON.stringify(this.customWords));
    localStorage.setItem('wordStats', JSON.stringify(this.wordStats));
    localStorage.setItem('weeklyProgress', JSON.stringify(this.weeklyProgress));
  }

  loadData() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    const learning = localStorage.getItem('learningWords');
    if (learning) this.learningWords = JSON.parse(learning);
    const custom = localStorage.getItem('customWords');
    if (custom) this.customWords = JSON.parse(custom);
    const stats = localStorage.getItem('wordStats');
    if (stats) this.wordStats = JSON.parse(stats);
    const weekly = localStorage.getItem('weeklyProgress');
    if (weekly) this.weeklyProgress = JSON.parse(weekly);
  }
}

const app = new EnglishWordsApp();
window.app = app;
