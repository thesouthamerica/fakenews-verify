<script setup lang="ts">
import { ref, computed } from 'vue'
import { UploadCloud, Loader2, CheckCircle2, ExternalLink, LogIn, UserPlus, LogOut, ShieldAlert, Coins } from 'lucide-vue-next'

// Estados de Autenticação
const isLoggedIn = ref(false)
const currentUser = ref<{ id: string; name: string; credits: { gemini: number; grok: number; } } | null>(null)
const totalCredits = computed(() => {
  if (!currentUser.value) return 0;
  // Garante que a soma funcione mesmo se a estrutura de créditos for inesperada
  return (currentUser.value.credits?.gemini || 0) + (currentUser.value.credits?.grok || 0);
})

const authMode = ref<'login' | 'register'>('login')

// Campos do Formulário de Auth
const formEmail = ref('')
const formPassword = ref('')
const formName = ref('')
const authError = ref('')
const authLoading = ref(false)

// Estados da Ferramenta de Verificação
const file = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const isLoading = ref(false)
const analysisResult = ref<any>(null)
const isCreditsModalOpen = ref(false)
const isPurchaseModalOpen = ref(false)
const purchaseLoading = ref(false)

const creditPackages = [ { credits: 50, price: 5 }, { credits: 120, price: 10 }, { credits: 300, price: 20 } ];

// Novo estado para controle do provedor de IA
const currentAIProvider = ref<'gemini' | 'grok'>('gemini')
const isGrokFallbackActive = ref(false)

// --- FUNÇÕES DE AUTENTICAÇÃO ---
const handleAuth = async () => {
  authError.value = ''
  authLoading.value = true

  const endpoint = authMode.value === 'login' ? '/api/login' : '/api/register'
  const payload = authMode.value === 'login' 
    ? { email: formEmail.value, password: formPassword.value }
    : { name: formName.value, email: formEmail.value, password: formPassword.value }

  try {
    const response = await fetch(`http://localhost:8787${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Erro na autenticação')
    }

    const user = data.user;
    // Lógica de transição para a nova estrutura de créditos
    if (typeof user.credits === 'number' || !user.credits) {
      // Para usuários existentes ou novos, define um padrão se a resposta da API for antiga
      currentUser.value = { ...user, credits: { gemini: user.credits || 5, grok: 5 } };
    } else {
      currentUser.value = user;
    }

    isLoggedIn.value = true
    formEmail.value = ''
    formPassword.value = ''
    formName.value = ''
  } catch (error: any) {
    authError.value = error.message
  } finally {
    authLoading.value = false
  }
}

const logout = () => {
  isLoggedIn.value = false
  currentUser.value = null
  resetForm()
}

// --- FUNÇÕES DA FERRAMENTA ---
const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    file.value = target.files[0]
    previewUrl.value = URL.createObjectURL(file.value)
    analysisResult.value = null
  }
}

const analyzeImage = async () => {
  if (!file.value || !currentUser.value) return

  isLoading.value = true
  analysisResult.value = null

  // Armazena o provedor de IA atual para esta tentativa
  let usedProvider = currentAIProvider.value

  const formData = new FormData()
  formData.append('image', file.value)
  formData.append('userId', currentUser.value.id)

  if (usedProvider === 'grok') {
    formData.append('useGrok', 'true') // Informa ao backend para usar Grok
  }
  try {
    const response = await fetch('http://localhost:8787/api/verify', {
      method: 'POST',
      body: formData
    })

    const data = await response.json()
    
    if (!response.ok) {
      // Verifica se o erro é de esgotamento de tokens do Gemini
      if (data.error === 'GEMINI_TOKENS_EXHAUSTED' && usedProvider === 'gemini') {
        console.warn("Tokens do Gemini esgotados, tentando fallback para a API Grok.")
        isGrokFallbackActive.value = true // Atualiza o indicador na UI
        currentAIProvider.value = 'grok' // Define o provedor para a próxima tentativa
        return analyzeImage() // Tenta novamente a análise com Grok
      }
      throw new Error(data.error || 'Erro desconhecido no servidor') // Outros erros
    }

    analysisResult.value = data.analysis
    // O backend deve retornar o objeto `updatedCredits: { gemini: number, grok: number }`
    if (currentUser.value && data.updatedCredits) {
      currentUser.value.credits = data.updatedCredits
    }

    // Se a análise foi bem-sucedida com Grok, reseta para Gemini para a próxima vez
    if (usedProvider === 'grok') {
      currentAIProvider.value = 'gemini'
      isGrokFallbackActive.value = false
    }
  } catch (error: any) {
    console.error("Erro na requisição:", error)
    alert("Erro na análise: " + error.message)
  } finally {
    isLoading.value = false
  }
}

// Reseta o provedor de IA para Gemini se o usuário resetar o formulário


const resetForm = () => {
  file.value = null
  previewUrl.value = null
  analysisResult.value = null
}

const reportError = () => {
  // Aqui você pode adicionar a lógica para reportar o erro.
  // Por exemplo, abrir um modal, redirecionar para uma página de contato, ou usar um serviço de logging.
  alert('Obrigado por reportar! Em uma aplicação real, isso abriria um formulário de contato ou enviaria um log de erro.');
}

const toggleCreditsModal = () => {
  isCreditsModalOpen.value = !isCreditsModalOpen.value;
}

const openPurchaseModal = () => {
  isCreditsModalOpen.value = false;
  isPurchaseModalOpen.value = true;
}

const closePurchaseModal = () => {
  isPurchaseModalOpen.value = false;
}

const purchaseCredits = async (pkg: { credits: number, price: number }) => {
  if (!currentUser.value) return;
  purchaseLoading.value = true;

  // --- SIMULAÇÃO DE BACKEND ---
  // Em uma aplicação real, aqui você faria a chamada para o seu backend,
  // que por sua vez se comunicaria com um gateway de pagamento (Stripe, etc.).
  console.log(`Iniciando compra de ${pkg.credits} créditos por R$${pkg.price}...`);
  
  await new Promise(resolve => setTimeout(resolve, 1500)); // Simula latência da rede

  // Após o pagamento bem-sucedido no backend, ele atualizaria o DB
  // e retornaria os créditos atualizados. Aqui, simulamos essa atualização.
  currentUser.value.credits.gemini += pkg.credits;
  console.log('Compra bem-sucedida! Créditos atualizados.');
  // --- FIM DA SIMULAÇÃO ---

  purchaseLoading.value = false;
  isPurchaseModalOpen.value = false;
  alert(`${pkg.credits} créditos adicionados com sucesso!`);
}
</script>

<template>
  <div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between font-sans selection:bg-violet-500 selection:text-white">
    
    <!-- Cabeçalho com Área de Login / Usuário Logado -->
    <header class="border-b border-zinc-800/60 bg-zinc-900/55 backdrop-blur-md sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <ShieldAlert class="w-5 h-5 text-white" />
          </div>
          <span class="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Logo do SAS <span class="text-xs text-violet-400 font-medium px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 ml-1">Verificador</span>
          </span>
        </div>

        <!-- Se estiver logado, exibe informações e botão Sair -->
        <div v-if="isLoggedIn && currentUser" class="flex items-center space-x-4">
          <button @click="toggleCreditsModal" class="flex items-center space-x-2 bg-zinc-800/60 border border-zinc-700/50 px-3 py-1.5 rounded-full text-xs hover:bg-zinc-700/70 hover:border-zinc-600 transition-all">
            <Coins class="w-3.5 h-3.5 text-amber-400" />
            <span class="text-zinc-300 font-medium">{{ totalCredits }} créditos totais</span>
          </button>
          <span class="text-sm font-medium text-zinc-200 hidden sm:inline">Olá, {{ currentUser.name }}</span>
          <button @click="logout" class="flex items-center space-x-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 transition-colors">
            <LogOut class="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Conteúdo Principal -->
    <main class="max-w-3xl w-full mx-auto px-6 py-12 flex-grow">
      
      <!-- TELA 1: LOGIN / CADASTRO (Exibida se não estiver logado) -->
      <div v-if="!isLoggedIn" class="max-w-md mx-auto bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div class="text-center mb-6">
          <h2 class="text-2xl font-bold text-white mb-2">
            {{ authMode === 'login' ? 'Acesse sua conta' : 'Crie sua conta gratuita' }}
          </h2>
          <p class="text-xs text-zinc-400">Entre para utilizar o verificador de fatos com IA</p>
        </div>

        <!-- Alternador de Abas (Login / Registrar) -->
        <div class="flex bg-zinc-950 p-1 rounded-xl mb-6 border border-zinc-800">
          <button @click="authMode = 'login'; authError = ''" 
                  :class="authMode === 'login' ? 'bg-violet-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'"
                  class="flex-1 py-2 text-xs font-medium rounded-lg transition-all">
            Entrar
          </button>
          <button @click="authMode = 'register'; authError = ''" 
                  :class="authMode === 'register' ? 'bg-violet-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'"
                  class="flex-1 py-2 text-xs font-medium rounded-lg transition-all">
            Cadastrar
          </button>
        </div>

        <form @submit.prevent="handleAuth" class="space-y-4">
          <div v-if="authMode === 'register'">
            <label class="block text-xs font-medium text-zinc-400 mb-1">Nome Completo</label>
            <input v-model="formName" type="text" required placeholder="Seu nome" 
                   class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">E-mail</label>
            <input v-model="formEmail" type="email" required placeholder="seu@email.com" 
                   class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Senha</label>
            <input v-model="formPassword" type="password" required placeholder="••••••••" 
                   class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
          </div>

          <p v-if="authError" class="text-xs text-rose-500 text-center font-medium">{{ authError }}</p>

          <button type="submit" :disabled="authLoading" 
                  class="w-full py-3 px-4 rounded-xl font-medium text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-violet-600/20 transition-all flex items-center justify-center space-x-2">
            <Loader2 v-if="authLoading" class="w-4 h-4 animate-spin" />
            <span v-else class="flex items-center space-x-2">
              <component :is="authMode === 'login' ? LogIn : UserPlus" class="w-4 h-4" />
              <span>{{ authMode === 'login' ? 'Entrar no Sistema' : 'Criar Conta' }}</span>
            </span>
          </button>
        </form>
      </div>

      <!-- TELA 2: VERIFICADOR DE FATOS (Exibida apenas se estiver logado) -->
      <div v-else>
        <div class="text-center mb-10">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Verificador de Fatos com Inteligência Artificial
          </h1>
          <p class="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
            Faça o upload de prints, notícias ou imagens suspeitas. Nossa IA analisa o contexto e cruza com fontes confiáveis.
          </p>
        </div>

        <!-- Caixa de Upload / Preview -->
        <div class="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm transition-all">
          <div v-if="!previewUrl" class="border-2 border-dashed border-zinc-700 hover:border-violet-500/60 rounded-xl p-8 text-center transition-colors relative group cursor-pointer bg-zinc-950/40">
            <input type="file" accept="image/*" @change="handleFileUpload" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
            <div class="w-14 h-14 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
              <UploadCloud class="w-7 h-7 text-violet-400" />
            </div>
            <p class="text-sm font-medium text-zinc-200 mb-1">
              Arraste sua imagem aqui ou <span class="text-violet-400 underline underline-offset-2">clique para buscar</span>
            </p>
            <p class="text-xs text-zinc-500">PNG, JPG ou WEBP até 10MB</p>
          </div>

          <div v-else class="space-y-6">
            <div class="relative rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex justify-center max-h-[380px]">
              <img :src="previewUrl" alt="Preview" class="object-contain max-h-[380px] w-full" />
              <button @click="resetForm" class="absolute top-3 right-3 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700/60 backdrop-blur-md transition-colors">
                Trocar imagem
              </button>
            </div>

            <button @click="analyzeImage" :disabled="isLoading" class="w-full py-3.5 px-4 rounded-xl font-medium text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-600/20 transition-all flex items-center justify-center space-x-2">
              <Loader2 v-if="isLoading" class="w-5 h-5 animate-spin" />
              <span>{{ isLoading ? 'Analisando com Inteligência Artificial...' : 'Verificar Veracidade' }}</span>
          <span v-if="isGrokFallbackActive" class="text-xs text-amber-300 ml-2">(Usando Grok)</span>
            </button>
          </div>
        </div>

        <!-- Resultados da Análise -->
        <div v-if="analysisResult" class="mt-8 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl space-y-6">
          <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
            <h2 class="text-lg font-semibold text-white flex items-center space-x-2">
              <CheckCircle2 class="w-5 h-5 text-emerald-400" />
              <span>Relatório de Verificação</span>
            </h2>
            <div class="text-right">
              <span class="text-xs text-zinc-400 uppercase tracking-wider block">Índice de Confiabilidade</span>
              <span class="text-2xl font-black" :class="analysisResult.percentual_veracidade > 50 ? 'text-emerald-400' : 'text-rose-500'">
                {{ analysisResult.percentual_veracidade }}%
              </span>
            </div>
          </div>

          <!-- Barra de Progresso Visual -->
          <div class="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800">
            <div class="h-full transition-all duration-1000 rounded-full" 
                 :class="analysisResult.percentual_veracidade > 50 ? 'bg-emerald-500' : 'bg-rose-500'" 
                 :style="{ width: `${analysisResult.percentual_veracidade}%` }">
            </div>
          </div>

          <!-- Resumo -->
          <div class="space-y-2">
            <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Resumo da Análise</h3>
            <p class="text-zinc-200 text-sm leading-relaxed bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/60">
              {{ analysisResult.resumo }}
            </p>
          </div>

          <!-- Fontes -->
          <div v-if="analysisResult.fontes_confiaveis && analysisResult.fontes_confiaveis.length > 0" class="space-y-3">
            <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Fontes e Referências Citadas</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a v-for="fonte in analysisResult.fontes_confiaveis" :key="fonte" :href="fonte" target="_blank" 
                 class="flex items-center justify-between p-3 rounded-xl bg-zinc-950/40 border border-zinc-800/80 hover:border-violet-500/50 hover:bg-zinc-800/40 text-xs text-zinc-300 transition-all group">
                <span class="truncate pr-2">{{ fonte }}</span>
                <ExternalLink class="w-4 h-4 text-zinc-500 group-hover:text-violet-400 flex-shrink-0 transition-colors" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Botão de Reportar Erro -->
    <div class="text-center pb-6">
      <button @click="reportError" class="text-xs text-zinc-500 hover:text-zinc-400 hover:underline underline-offset-2 transition-colors">
        Reportar um erro na aplicação
      </button>
    </div>

    <!-- Footer -->
    <footer class="border-t border-zinc-800/60 bg-zinc-900/30 py-6 text-center text-xs text-zinc-500">
      <p>
        Desenvolvido por Leonardo Bezerra - <a href="https://github.com/thesouthamerica" target="_blank" rel="noopener noreferrer" class="text-violet-400 hover:underline">GitHub</a>
      </p>
      <p>Powered by Cloudflare Workers & Google Gemini</p>
    </footer>

    <!-- Modal de Créditos -->
    <div v-if="isCreditsModalOpen && currentUser" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="toggleCreditsModal">
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm transform transition-all scale-100 opacity-100">
        <h3 class="text-lg font-bold text-white mb-2">Seus Créditos de IA</h3>
        <p class="text-xs text-zinc-400 mb-6">
          Sua conta possui saldos separados para diferentes provedores de IA, garantindo maior disponibilidade do serviço.
        </p>
        <div class="space-y-3">
          <div class="flex justify-between items-center bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
            <div class="flex items-center space-x-3">
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google Gemini" class="h-6 w-6">
              <span class="font-medium text-sm text-zinc-200">Créditos Gemini</span>
            </div>
            <span class="font-bold text-lg text-amber-400">{{ currentUser.credits.gemini }}</span>
          </div>
          <div class="flex justify-between items-center bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
            <div class="flex items-center space-x-3">
              <svg class="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.25c-5.376 0-9.75 4.374-9.75 9.75s4.374 9.75 9.75 9.75 9.75-4.374 9.75-9.75S17.376 2.25 12 2.25Zm0 1.5c4.554 0 8.25 3.696 8.25 8.25s-3.696 8.25-8.25 8.25S3.75 16.554 3.75 12 7.446 3.75 12 3.75Zm-3.69 4.773.738 1.325a3.738 3.738 0 0 0 2.952 2.952l1.325.738-1.325.738a3.738 3.738 0 0 0-2.952 2.952l-.738 1.325-.738-1.325a3.738 3.738 0 0 0-2.952-2.952l-1.325-.738 1.325-.738a3.738 3.738 0 0 0 2.952-2.952l.738-1.325Z" /></svg>
              <span class="font-medium text-sm text-zinc-200">Créditos Grok (Fallback)</span>
            </div>
            <span class="font-bold text-lg text-amber-400">{{ currentUser.credits.grok }}</span>
          </div>
        </div>
        <div class="mt-6 space-y-2">
          <button @click="openPurchaseModal" class="w-full py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-600/20 transition-all">
            Comprar Mais Créditos
          </button>
          <button @click="toggleCreditsModal" class="w-full py-2.5 rounded-xl font-medium text-zinc-400 bg-zinc-800/60 hover:bg-zinc-700/80 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Compra de Créditos -->
    <div v-if="isPurchaseModalOpen" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="!purchaseLoading && closePurchaseModal()">
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md transform transition-all scale-100 opacity-100">
        <h3 class="text-lg font-bold text-white mb-2">Comprar Créditos</h3>
        <p class="text-xs text-zinc-400 mb-6">
          Selecione um pacote para recarregar seus créditos Gemini. O pagamento é simulado.
        </p>

        <div v-if="purchaseLoading" class="flex flex-col items-center justify-center h-48">
          <Loader2 class="w-8 h-8 animate-spin text-violet-400" />
          <p class="mt-4 text-sm text-zinc-300">Processando sua compra...</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button v-for="pkg in creditPackages" :key="pkg.credits" @click="purchaseCredits(pkg)"
                  class="p-6 text-center bg-zinc-950/50 border border-zinc-800 rounded-2xl hover:border-violet-500 hover:bg-violet-500/10 transition-all group">
            <p class="text-3xl font-black text-amber-400 group-hover:text-amber-300 transition-colors">{{ pkg.credits }}</p>
            <p class="text-xs text-zinc-400 mb-3">créditos</p>
            <p class="text-sm font-semibold text-white bg-zinc-800 group-hover:bg-violet-600 transition-colors rounded-lg py-2">
              R$ {{ pkg.price.toFixed(2).replace('.', ',') }}
            </p>
          </button>
        </div>
        <button @click="closePurchaseModal" :disabled="purchaseLoading" class="mt-6 w-full py-2.5 rounded-xl font-medium text-zinc-400 bg-zinc-800/60 hover:bg-zinc-700/80 transition-colors disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  </div>
</template>