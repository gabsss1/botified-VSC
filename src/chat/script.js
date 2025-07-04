//ts conflics
/** @type {() => { postMessage: (msg: any) => void }} */
let acquireVsCodeApi;
// Utilidades DOM
function $(selector) {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`No se encontró el elemento: ${selector}`)
  return el
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = $("#confirmModal");
    const msg = $("#confirmMessage");
    const yes = $("#confirmYes");
    const no = $("#confirmNo");

    msg.textContent = message;
    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
    };

    const onYes = () => {
      cleanup();
      resolve(true);
    };

    const onNo = () => {
      cleanup();
      resolve(false);
    };

    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
  });
}


function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight
}

// Estado de la aplicación
let isWaitingForResponse = false
let messageHistory = []
let currentFile = null
let fileIncludedInContext = false
let vscode = null

// Sistema de conversaciones
let conversations = {}
let currentConversationId = null

// Elementos del DOM
const messagesArea = $("#messagesArea")
const messageInput = $("#messageInput")
const sendButton = $("#sendButton")
const emptyState = $("#emptyState")
const typingIndicator = $("#typingIndicator")
const charCounter = $("#charCounter")
const newChatBtn = $("#newChatBtn")
const clearBtn = $("#clearBtn")
const exportBtn = $("#exportBtn")
const codeBtn = $("#codeBtn")
const chatHistory = $("#chatHistory")

// Elementos de archivo
const activeFileSection = $("#activeFileSection")
const fileName = $("#fileName")
const filePath = $("#filePath")
const fileIcon = $("#fileIcon")
const includeFileBtn = $("#includeFileBtn")
const viewFileBtn = $("#viewFileBtn")
const refreshFileBtn = $("#refreshFileBtn")
const contextIndicator = $("#contextIndicator")
const fileContextBanner = $("#fileContextBanner")
const contextFileName = $("#contextFileName")
const removeContextBtn = $("#removeContextBtn")

// Modal de vista previa
const filePreviewModal = $("#filePreviewModal")
const previewFileName = $("#previewFileName")
const filePreviewContent = $("#filePreviewContent")
const closePreviewBtn = $("#closePreviewBtn")
const copyFileBtn = $("#copyFileBtn")
const includeFromPreviewBtn = $("#includeFromPreviewBtn")

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  initializeApp()
})

function initializeApp() {
  loadConversationsFromStorage()
  setupEventListeners()
  updateCharCounter()
  adjustTextareaHeight()
  messageInput.focus()

  // Si no hay conversaciones, crear una nueva
  if (Object.keys(conversations).length === 0) {
    createNewConversation()
  } else {
    // Cargar la última conversación activa
    const lastActiveId = localStorage.getItem("lastActiveConversation")
    if (lastActiveId && conversations[lastActiveId]) {
      switchToConversation(lastActiveId)
    } else {
      // Cargar la primera conversación disponible
      const firstId = Object.keys(conversations)[0]
      switchToConversation(firstId)
    }
  }

  updateChatHistoryUI()

  // Inicializar VSCode API
  if (typeof acquireVsCodeApi !== "undefined") {
    vscode = acquireVsCodeApi()
    requestActiveFile()
  }
}

// Sistema de gestión de conversaciones
function generateConversationId() {
  return "conv_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
}

function createNewConversation() {
  const id = generateConversationId()
  const now = new Date()

  conversations[id] = {
    id: id,
    title: "Nueva conversación",
    messages: [],
    createdAt: now,
    updatedAt: now,
  }

  switchToConversation(id)
  saveConversationsToStorage()
  updateChatHistoryUI()

  return id
}

function switchToConversation(conversationId) {
  if (!conversations[conversationId]) return

  // Guardar conversación actual si existe
  if (currentConversationId && conversations[currentConversationId]) {
    conversations[currentConversationId].messages = [...messageHistory]
    conversations[currentConversationId].updatedAt = new Date()
  }

  // Cambiar a nueva conversación
  currentConversationId = conversationId
  messageHistory = [...conversations[conversationId].messages]

  // Actualizar UI
  clearMessagesUI()
  loadMessagesIntoUI()

  if (messageHistory.length === 0) {
    showEmptyState()
  } else {
    hideEmptyState()
  }

  // Guardar como última conversación activa
  localStorage.setItem("lastActiveConversation", conversationId)
  saveConversationsToStorage()
  updateChatHistoryUI()
}

function deleteConversation(conversationId) {
  if (!conversations[conversationId]) return;

  const ids = Object.keys(conversations);
  if (ids.length === 1) {
    alert("No puedes borrar la única conversación. Crea una nueva primero.");
    return;
  }

  if (currentConversationId === conversationId) {
    const otherId = ids.find((id) => id !== conversationId);
    switchToConversation(otherId);
  }

  delete conversations[conversationId];
  saveConversationsToStorage();
  updateChatHistoryUI();
}

function updateConversationTitle(conversationId, newTitle) {
  if (conversations[conversationId]) {
    conversations[conversationId].title = newTitle
    conversations[conversationId].updatedAt = new Date()
    saveConversationsToStorage()
    updateChatHistoryUI()
  }
}

function getConversationTitle(messages) {
  if (messages.length === 0) return "Nueva conversación"

  const firstUserMessage = messages.find((msg) => msg.sender === "user")
  if (firstUserMessage) {
    let title = firstUserMessage.text.substring(0, 30)
    if (firstUserMessage.text.length > 30) title += "..."
    return title
  }

  return "Nueva conversación"
}

// Persistencia en localStorage
function saveConversationsToStorage() {
  try {
    // Actualizar conversación actual antes de guardar
    if (currentConversationId && conversations[currentConversationId]) {
      conversations[currentConversationId].messages = [...messageHistory]
      conversations[currentConversationId].updatedAt = new Date()

      // Actualizar título automáticamente si es "Nueva conversación"
      if (conversations[currentConversationId].title === "Nueva conversación" && messageHistory.length > 0) {
        conversations[currentConversationId].title = getConversationTitle(messageHistory)
      }
    }

    localStorage.setItem("botified_conversations", JSON.stringify(conversations))
  } catch (error) {
    console.error("Error guardando conversaciones:", error)
  }
}

function loadConversationsFromStorage() {
  try {
    const stored = localStorage.getItem("botified_conversations")
    if (stored) {
      const parsed = JSON.parse(stored)

      // Convertir fechas de string a Date objects
      Object.keys(parsed).forEach((id) => {
        parsed[id].createdAt = new Date(parsed[id].createdAt)
        parsed[id].updatedAt = new Date(parsed[id].updatedAt)
      })

      conversations = parsed
    }
  } catch (error) {
    console.error("Error cargando conversaciones:", error)
    conversations = {}
  }
}

// UI del historial de chat
function updateChatHistoryUI() {
  clearElement(chatHistory)

  const conversationIds = Object.keys(conversations).sort((a, b) => {
    return conversations[b].updatedAt - conversations[a].updatedAt
  })

  // Agrupar por fecha
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const groups = {
    today: [],
    yesterday: [],
    older: [],
  }

  conversationIds.forEach((id) => {
    const conv = conversations[id]
    const convDate = new Date(conv.updatedAt)

    if (isSameDay(convDate, today)) {
      groups.today.push(conv)
    } else if (isSameDay(convDate, yesterday)) {
      groups.yesterday.push(conv)
    } else {
      groups.older.push(conv)
    }
  })

  // Renderizar grupos
  if (groups.today.length > 0) {
    renderConversationGroup("Hoy", groups.today)
  }

  if (groups.yesterday.length > 0) {
    renderConversationGroup("Ayer", groups.yesterday)
  }

  if (groups.older.length > 0) {
    renderConversationGroup("Anteriores", groups.older)
  }
}

function renderConversationGroup(title, conversations) {
  const section = document.createElement("div")
  section.className = "history-section"

  const header = document.createElement("h3")
  header.textContent = title
  section.appendChild(header)

  conversations.forEach((conv) => {
    const item = createConversationItem(conv)
    section.appendChild(item)
  })

  chatHistory.appendChild(section)
}

function createConversationItem(conversation) {
  const item = document.createElement("div")
  item.className = "history-item"
  if (conversation.id === currentConversationId) {
    item.classList.add("active")
  }

  const title = document.createElement("span")
  title.className = "history-title"
  title.textContent = conversation.title
  title.title = conversation.title // Tooltip para títulos largos

  const deleteBtn = document.createElement("button")
  deleteBtn.className = "history-delete"
  deleteBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `
  deleteBtn.title = "Borrar conversación"

  // Event listeners
  item.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target === deleteBtn || target.closest(".history-delete")) return;
    switchToConversation(conversation.id);
  });

  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation()
    const confirmed = await showConfirm(`¿Borrar la conversación "${conversation.title}"?`);
    if (confirmed) {
      deleteConversation(conversation.id)
    }
  })

  item.appendChild(title)
  item.appendChild(deleteBtn)

  return item
}

function isSameDay(date1, date2) {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  )
}

// Event Listeners
function setupEventListeners() {
  // Input y envío
  messageInput.addEventListener("input", handleInputChange)
  messageInput.addEventListener("keydown", handleKeyDown)
  sendButton.addEventListener("click", handleSendMessage)

  // Botones de acción
  newChatBtn.addEventListener("click", handleNewChat)
  clearBtn.addEventListener("click", handleClearChat)
  exportBtn.addEventListener("click", handleExportChat)
  codeBtn.addEventListener("click", handleInsertCode)

  // Botones de archivo
  includeFileBtn.addEventListener("click", handleIncludeFile)
  viewFileBtn.addEventListener("click", handleViewFile)
  refreshFileBtn.addEventListener("click", requestActiveFile)
  removeContextBtn.addEventListener("click", handleRemoveContext)

  // Modal
  closePreviewBtn.addEventListener("click", closeFilePreview)
  copyFileBtn.addEventListener("click", handleCopyFile)
  includeFromPreviewBtn.addEventListener("click", handleIncludeFromPreview)
  filePreviewModal.addEventListener("click", (e) => {
    if (e.target === filePreviewModal) closeFilePreview()
  })

  // Tarjetas de sugerencia
  document.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const card = target.closest(".suggestion-card");
    if (card) {
      const prompt = card.getAttribute("data-prompt");
      if (prompt) {
        messageInput.value = prompt;
        handleSendMessage();
      }
    }
  });

  // Comunicación con VSCode
  if (vscode) {
    window.addEventListener("message", (event) => {
      const message = event.data
      switch (message.command) {
        case "response":
          handleBotResponse(message.text)
          break
        case "activeFile":
          handleActiveFileUpdate(message.file)
          break
        case "fileContent":
          handleFileContent(message.content)
          break
      }
    })
  }

  // Auto-guardar cada 30 segundos
  setInterval(() => {
    saveConversationsToStorage()
  }, 30000)

  // Guardar antes de cerrar la ventana
  window.addEventListener("beforeunload", () => {
    saveConversationsToStorage()
  })
}

// Manejo de archivo activo
function requestActiveFile() {
  if (vscode) {
    vscode.postMessage({ command: "getActiveFile" })
  }
}

function handleActiveFileUpdate(file) {
  currentFile = file

  if (file) {
    activeFileSection.style.display = "block"
    fileName.textContent = file.name
    filePath.textContent = file.path

    // Actualizar icono según extensión
    const extension = file.name.split(".").pop().toLowerCase()
    fileIcon.className = `file-icon ${extension}`

    // Resetear estado de contexto
    updateContextState(false)
  } else {
    activeFileSection.style.display = "none"
    currentFile = null
    updateContextState(false)
  }
}

function handleIncludeFile() {
  if (!currentFile) return

  if (fileIncludedInContext) {
    updateContextState(false)
  } else {
    // Solicitar contenido del archivo
    if (vscode) {
      vscode.postMessage({
        command: "getFileContent",
        filePath: currentFile.path,
      })
    }
  }
}

function handleFileContent(content) {
  if (content && currentFile) {
    currentFile.content = content
    updateContextState(true)
  }
}

function updateContextState(included) {
  fileIncludedInContext = included

  if (included) {
    includeFileBtn.classList.add("active")
    includeFileBtn.title = "Remover del contexto"
    contextIndicator.style.display = "block"
    fileContextBanner.style.display = "flex"
    contextFileName.textContent = `${currentFile.name} incluido en el contexto`
  } else {
    includeFileBtn.classList.remove("active")
    includeFileBtn.title = "Incluir archivo en contexto"
    contextIndicator.style.display = "none"
    fileContextBanner.style.display = "none"
  }
}

function handleRemoveContext() {
  updateContextState(false)
}

function handleViewFile() {
  if (!currentFile) return

  if (currentFile.content) {
    showFilePreview()
  } else {
    // Solicitar contenido si no lo tenemos
    if (vscode) {
      vscode.postMessage({
        command: "getFileContent",
        filePath: currentFile.path,
      })
    }
  }
}

function showFilePreview() {
  if (!currentFile || !currentFile.content) return

  previewFileName.textContent = currentFile.name
  filePreviewContent.querySelector("code").textContent = currentFile.content
  filePreviewModal.style.display = "flex"
}

function closeFilePreview() {
  filePreviewModal.style.display = "none"
}

function handleCopyFile() {
  if (currentFile && currentFile.content) {
    navigator.clipboard.writeText(currentFile.content).then(() => {
      // Mostrar feedback visual
      copyFileBtn.textContent = "¡Copiado!"
      setTimeout(() => {
        copyFileBtn.textContent = "Copiar código"
      }, 2000)
    })
  }
}

function handleIncludeFromPreview() {
  if (currentFile && currentFile.content) {
    updateContextState(true)
    closeFilePreview()
  }
}

// Manejo de input
function handleInputChange() {
  adjustTextareaHeight()
  updateCharCounter()
  updateSendButton()
}

function handleKeyDown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault()
    handleSendMessage()
  }
}

function adjustTextareaHeight() {
  messageInput.style.height = "auto"
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px"
}

function updateCharCounter() {
  const count = messageInput.value.length
  charCounter.textContent = `${count}/4000`

  if (count > 3500) {
    charCounter.style.color = "var(--warning)"
  } else if (count >= 4000) {
    charCounter.style.color = "var(--error)"
  } else {
    charCounter.style.color = "var(--text-muted)"
  }
}

function updateSendButton() {
  const hasText = messageInput.value.trim().length > 0
  const isValid = messageInput.value.length <= 4000
  sendButton.disabled = !hasText || !isValid || isWaitingForResponse
}

// Envío de mensajes
function handleSendMessage() {
  const message = messageInput.value.trim()
  if (!message || isWaitingForResponse) return

  hideEmptyState()
  addMessage(message, "user")

  messageInput.value = ""
  updateCharCounter()
  adjustTextareaHeight()

  showTypingIndicator()

  // Preparar contexto
  let contextMessage = message
  if (fileIncludedInContext && currentFile && currentFile.content) {
    contextMessage = `Archivo: ${currentFile.name} (${currentFile.path})\n\n\`\`\`${getFileLanguage(currentFile.name)}\n${currentFile.content}\n\`\`\`\n\nPregunta: ${message}`
  }

  // Siempre usar respuestas simuladas por ahora
  sendMessageToBackend(contextMessage);

  isWaitingForResponse = true
  updateSendButton()

  // Guardar automáticamente después de enviar mensaje
  setTimeout(() => {
    saveConversationsToStorage()
  }, 100)
}

async function sendMessageToBackend(promptText) {
  try {
    const response = await fetch("https://botified-backend-331043418769.us-central1.run.app/api/prompts/unified", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: promptText,
        model: "gpt-4o-mini"
      })
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (data && (data.files || data.comments)) {
      handleBotResponse(data);
    } else {
      showError("La respuesta del servidor no es válida.");
      hideTypingIndicator();
      isWaitingForResponse = false;
      updateSendButton();
    }
  } catch (error) {
    console.error("Error al llamar a la API:", error);
    showError("Error al obtener la respuesta.");
    hideTypingIndicator();
    isWaitingForResponse = false;
    updateSendButton();
  }
}

function getFileLanguage(fileName) {
  const extension = fileName.split(".").pop().toLowerCase()
  const languageMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    java: "java",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
  }
  return languageMap[extension] || "text"
}

// Manejo de respuestas
function handleBotResponse(data) {
  hideTypingIndicator();

  // Soporta comments como string o array
  let commentsText = "";
  if (typeof data.comments === "string") {
    commentsText = data.comments.trim();
  } else if (Array.isArray(data.comments)) {
    commentsText = data.comments.join("\n").trim();
  }

  const hasComments = commentsText.length > 0;
  const hasFiles = data.files && Array.isArray(data.files) && data.files.length > 0;

  if (hasComments || hasFiles) {
    // Crear un solo bloque
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.innerHTML = getAIIcon();

    const content = document.createElement("div");
    content.className = "message-content";

    if (hasComments) {
      const commentDiv = document.createElement("div");
      commentDiv.className = "message-text";
      commentDiv.innerHTML = formatMessage(commentsText);
      content.appendChild(commentDiv);
    }

    if (hasFiles) {
      data.files.forEach((file) => {
        const fileDiv = document.createElement("div");
        fileDiv.className = "file-block";
        fileDiv.innerHTML = `
          <strong>Archivo:</strong> ${escapeHtml(file.filename)}
          <pre><code>${escapeHtml(file.content)}</code></pre>
        `;

        const createButton = document.createElement("button");
        createButton.className = "generate-file-btn";
        createButton.textContent = "Crear archivo";
        createButton.addEventListener("click", () => {
          if (vscode) {
            vscode.postMessage({
              command: "createFiles",
              files: [{
                filename: file.filename,
                content: file.content
              }]
            });
          }
        });

        fileDiv.appendChild(createButton);
        content.appendChild(fileDiv);
      });
    }

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.textContent = formatTime(new Date());
    content.appendChild(messageTime);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    messagesArea.appendChild(messageDiv);
    scrollToBottom(messagesArea);

    // Guardar en historial
    messageHistory.push({
      text: hasComments ? commentsText : (hasFiles ? `Archivo: ${data.files[0].filename}` : ""),
      sender: "bot",
      timestamp: new Date()
    });

  } else {
    addMessage("No se generó contenido.", "bot");
  }

  isWaitingForResponse = false;
  updateSendButton();
  messageInput.focus();

  setTimeout(() => {
    saveConversationsToStorage();
    updateChatHistoryUI();
  }, 100);
}


// Gestión de mensajes
function addMessage(text, sender, timestamp = new Date()) {
  const messageElement = createMessageElement(text, sender, timestamp)
  messagesArea.appendChild(messageElement)

  messageHistory.push({ text, sender, timestamp })
  scrollToBottom(messagesArea)
}

function createMessageElement(text, sender, timestamp) {
  const messageDiv = document.createElement("div")
  messageDiv.className = `message ${sender}`

  const avatar = document.createElement("div")
  avatar.className = "message-avatar"
  avatar.innerHTML = sender === "user" ? "U" : getAIIcon()

  const content = document.createElement("div")
  content.className = "message-content"

  const messageText = document.createElement("div")
  messageText.className = "message-text"
  messageText.innerHTML = formatMessage(text)

  const messageTime = document.createElement("div")
  messageTime.className = "message-time"
  messageTime.textContent = formatTime(timestamp)

  content.appendChild(messageText)
  content.appendChild(messageTime)

  messageDiv.appendChild(avatar)
  messageDiv.appendChild(content)

  return messageDiv
}

function getAIIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatMessage(text) {
  if (typeof text !== "string") text = "";
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  text = text.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\n/g, "<br>");
  return text;
}

function formatTime(date) {
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Estados de UI
function hideEmptyState() {
  emptyState.style.display = "none"
}

function showEmptyState() {
  emptyState.style.display = "block"
}

function showTypingIndicator() {
  typingIndicator.style.display = "flex"
  scrollToBottom(messagesArea)
}

function hideTypingIndicator() {
  typingIndicator.style.display = "none"
}

function clearMessagesUI() {
  const messages = messagesArea.querySelectorAll(".message")
  messages.forEach((msg) => msg.remove())
}

function loadMessagesIntoUI() {
  messageHistory.forEach((msg) => {
    const messageElement = createMessageElement(msg.text, msg.sender, new Date(msg.timestamp))
    messagesArea.appendChild(messageElement)
  })
  scrollToBottom(messagesArea)
}

// Acciones de botones
function handleNewChat() {
  createNewConversation()
}

async function handleClearChat() {
  if (messageHistory.length > 0) {
    const confirmed = await showConfirm("¿Limpiar toda la conversación actual?");
    if (confirmed) {
      messageHistory = [];
      clearMessagesUI();
      showEmptyState();
      messageInput.focus();

      if (currentConversationId && conversations[currentConversationId]) {
        conversations[currentConversationId].messages = [];
        conversations[currentConversationId].title = "Nueva conversación";
        conversations[currentConversationId].updatedAt = new Date();
        saveConversationsToStorage();
        updateChatHistoryUI();
      }
    }
  }
}

function handleExportChat() {
  if (messageHistory.length === 0) {
    alert("No hay mensajes para exportar en esta conversación")
    return
  }

  const currentConv = conversations[currentConversationId]
  const title = currentConv ? currentConv.title : "Conversación"
  const date = new Date().toISOString().split("T")[0]

  // Crear contenido del export
  let exportContent = `# ${title}\n`
  exportContent += `Exportado el: ${new Date().toLocaleString("es-ES")}\n\n`
  exportContent += `---\n\n`

  messageHistory.forEach((msg, index) => {
    const time = new Date(msg.timestamp).toLocaleTimeString("es-ES")
    const sender = msg.sender === "user" ? "👤 Usuario" : "🤖 BOTIFIED"

    exportContent += `## ${sender} (${time})\n\n`
    exportContent += `${msg.text}\n\n`

    if (index < messageHistory.length - 1) {
      exportContent += `---\n\n`
    }
  })

  // Crear y descargar archivo
  const blob = new Blob([exportContent], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${date}.md`
  a.click()
  URL.revokeObjectURL(url)

  // Mostrar feedback
  const originalText = exportBtn.innerHTML
  exportBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `
  exportBtn.title = "¡Exportado!"

  setTimeout(() => {
    exportBtn.innerHTML = originalText
    exportBtn.title = "Exportar conversación"
  }, 2000)
}

function handleInsertCode() {
  const codeTemplate = "```\n// Tu código aquí\n```"
  const cursorPos = messageInput.selectionStart
  const textBefore = messageInput.value.substring(0, cursorPos)
  const textAfter = messageInput.value.substring(cursorPos)

  messageInput.value = textBefore + codeTemplate + textAfter
  messageInput.focus()
  messageInput.setSelectionRange(cursorPos + 4, cursorPos + 21)

  adjustTextareaHeight()
  updateCharCounter()
}

// Manejo de errores
function showError(message) {
  const errorDiv = document.createElement("div")
  errorDiv.className = "error-state"
  errorDiv.textContent = message
  messagesArea.appendChild(errorDiv)
  scrollToBottom(messagesArea)

  setTimeout(() => {
    errorDiv.remove()
  }, 5000)
}

// Exportar para uso externo
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    addMessage,
    handleBotResponse,
    showError,
    handleActiveFileUpdate,
    handleFileContent,
    createNewConversation,
    switchToConversation,
    deleteConversation,
  }
}