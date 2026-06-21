/* global SheetsClient */
import { ExpenseAPI } from '../core/api.js';
import { state } from '../core/state.js';
import { el, esc } from '../core/utils.js';
import { showMsg } from '../core/ui.js';

export function renderAdvisor() {
  const content = el('advisorContent');
  if (!content) return;

  content.innerHTML = `
    <div class="advisor-wrap">
      <div class="advisor-header">
        <span class="advisor-title">Financial Advisor</span>
        <button class="btn btn-ghost advisor-clear-btn" id="advisorClearBtn">Clear history</button>
      </div>
      <div class="advisor-messages" id="advisorMessages"></div>
      <div class="advisor-input-bar">
        <textarea class="advisor-input" id="advisorInput" placeholder="Ask your advisor anything…" rows="1"></textarea>
        <button class="btn btn-primary advisor-send-btn" id="advisorSendBtn">Send</button>
      </div>
    </div>
  `;

  _renderMessages();
  _loadHistory();

  const input = el('advisorInput');
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
  });
  el('advisorSendBtn')?.addEventListener('click', _sendMessage);
  el('advisorClearBtn')?.addEventListener('click', _clearHistory);
}

async function _loadHistory() {
  try {
    const res = await ExpenseAPI.getAdvisorHistory();
    if (res.ok) {
      state.advisorMessages = res.data || [];
      _renderMessages();
    }
  } catch (_) {}
}

function _renderMessages() {
  const container = el('advisorMessages');
  if (!container) return;

  if (!state.advisorMessages.length) {
    container.innerHTML = '<div class="advisor-empty">Ask me anything about your finances — spending patterns, budget tips, account health, and more.</div>';
    return;
  }

  container.innerHTML = state.advisorMessages.map(msg => `
    <div class="advisor-msg advisor-msg-${esc(msg.role)}">
      <div class="advisor-msg-bubble">${_formatContent(msg.content)}</div>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

function _formatContent(text) {
  if (!text) return '';
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function _sendMessage() {
  const input = el('advisorInput');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.style.height = '';

  state.advisorMessages = [...state.advisorMessages, { role: 'user', content: message }];
  _renderMessages();

  const container = el('advisorMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'advisor-msg advisor-msg-assistant';
  typingEl.id = 'advisorTyping';
  typingEl.innerHTML = '<div class="advisor-msg-bubble advisor-typing"><span></span><span></span><span></span></div>';
  container?.appendChild(typingEl);
  if (container) container.scrollTop = container.scrollHeight;

  const sendBtn = el('advisorSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await ExpenseAPI.advisorChat({ message });
    el('advisorTyping')?.remove();

    if (res.ok) {
      state.advisorMessages = [...state.advisorMessages, { role: 'assistant', content: res.content }];
      _renderMessages();
    } else {
      showMsg('Advisor error: ' + (res.error || 'unknown'), 'warn');
      state.advisorMessages = state.advisorMessages.slice(0, -1);
      _renderMessages();
    }
  } catch (_) {
    el('advisorTyping')?.remove();
    showMsg('Connection error — could not reach the advisor.', 'warn');
    state.advisorMessages = state.advisorMessages.slice(0, -1);
    _renderMessages();
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

async function _clearHistory() {
  if (!confirm('Clear all advisor conversation history?')) return;
  try {
    const res = await ExpenseAPI.clearAdvisorHistory();
    if (res.ok) {
      state.advisorMessages = [];
      _renderMessages();
    } else {
      showMsg('Failed to clear history', 'warn');
    }
  } catch (_) {
    showMsg('Connection error', 'warn');
  }
}
