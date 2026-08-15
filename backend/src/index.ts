import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Buffer } from 'node:buffer';

// Tipos de ambiente (Bindings)
type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  GEMINI_API_KEY: string;
  XAI_API_KEY: string;
  OPENROUTER_API_KEY: string;
};

// Tipos para as respostas das IAs (simplificado)
type AnalysisResult = {
  percentual_veracidade: number;
  resumo: string;
  fontes_confiaveis: string[];
};

// Tipo para os créditos do usuário
type UserCredits = {
  gemini: number;
  grok: number;
  openrouter: number;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware de CORS para permitir requisições do frontend
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], // Endereço do seu frontend
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// --- FUNÇÕES E ROTAS DE AUTENTICAÇÃO ---

/**
 * Gera um hash SHA-256 para a senha.
 * NOTA DE SEGURANÇA: Em um ambiente de produção, use um salt por usuário e um algoritmo mais forte como Argon2.
 */
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

app.post('/api/register', async (c) => {
  try {
    const { name, email, password } = await c.req.json();

    if (!name || !email || !password) {
      return c.json({ error: 'Nome, e-mail e senha são obrigatórios.' }, 400);
    }

    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const defaultCredits = JSON.stringify({ gemini: 5, grok: 5, openrouter: 10 });

    await c.env.DB.prepare(
      "INSERT INTO users (id, name, email, password_hash, credits) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, name, email, password_hash, defaultCredits)
    .run();

    const user = { id, name, email, credits: JSON.parse(defaultCredits) };

    return c.json({ user });

  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Este e-mail já está em uso.' }, 409);
    }
    console.error("Erro no registro:", e.message);
    return c.json({ error: 'Erro ao criar a conta.' }, 500);
  }
});

app.post('/api/login', async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'E-mail e senha são obrigatórios.' }, 400);
    }

    const userResult = await c.env.DB.prepare("SELECT id, name, email, password_hash, credits FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; name: string; email: string; password_hash: string; credits: string }>();

    if (!userResult) {
      return c.json({ error: 'Credenciais inválidas.' }, 401);
    }

    const password_hash = await hashPassword(password);

    if (password_hash !== userResult.password_hash) {
      return c.json({ error: 'Credenciais inválidas.' }, 401);
    }
    
    const credits = await getUserCredits(c.env.DB, userResult.id);

    const user = {
      id: userResult.id,
      name: userResult.name,
      email: userResult.email,
      credits: credits
    };

    return c.json({ user });

  } catch (e: any) {
    console.error("Erro no login:", e.message);
    return c.json({ error: 'Erro interno do servidor.' }, 500);
  }
});

// --- ROTA DE VERIFICAÇÃO ---
app.post('/api/verify', async (c) => {
  try {
    const formData = await c.req.formData();
    const imageFile = formData.get('image') as File;
    const userId = formData.get('userId') as string;
    const useGrok = formData.get('useGrok') === 'true';
    const useOpenRouter = formData.get('useOpenRouter') === 'true';

    if (!imageFile || !userId) {
      return c.json({ error: 'Imagem e ID do usuário são obrigatórios.' }, 400);
    }

    const imageBuffer = await imageFile.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    let analysis: AnalysisResult;
    let provider: 'gemini' | 'grok' | 'openrouter';

    // Lógica de Seleção do Provedor
    if (useOpenRouter) {
      provider = 'openrouter';
      analysis = await analyzeWithOpenRouter(imageBase64, imageFile.type, c.env);
      await updateUserCredits(c.env.DB, userId, 'openrouter');
    } else if (useGrok) {
      provider = 'grok';
      analysis = await analyzeWithGrok(imageBase64, imageFile.type, c.env);
      await updateUserCredits(c.env.DB, userId, 'grok');
    } else {
      provider = 'gemini';
      analysis = await analyzeWithGemini(imageBase64, imageFile.type, c.env);
      await updateUserCredits(c.env.DB, userId, 'gemini');
    }

    const updatedCredits = await getUserCredits(c.env.DB, userId);

    return c.json({
      analysis,
      updatedCredits,
    });

  } catch (error: any) {
    console.error(`Erro na API de verificação: ${error.message}`);

    // Retorna erros específicos para o frontend lidar com o fallback
    if (error.message.includes('GEMINI_QUOTA_EXCEEDED')) {
      return c.json({ error: 'GEMINI_TOKENS_EXHAUSTED' }, 429);
    }
    if (error.message.includes('GROK_QUOTA_EXCEEDED')) {
      return c.json({ error: 'GROK_TOKENS_EXHAUSTED' }, 429);
    }

    return c.json({ error: 'Ocorreu um erro interno no servidor.', details: error.message }, 500);
  }
});

// --- FUNÇÕES AUXILIARES DE IA ---

const createApiCall = async (url: string, options: RequestInit) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    // Trata erros de cota ou indisponibilidade para acionar o fallback
    if (response.status === 429) {
      if (url.includes('generativelanguage')) throw new Error('GEMINI_QUOTA_EXCEEDED');
      if (url.includes('x.ai')) throw new Error('GROK_QUOTA_EXCEEDED');
    }
    // Adiciona tratamento para erro 503 do Gemini (alta demanda/indisponibilidade)
    if (response.status === 503 && url.includes('generativelanguage')) {
        // Reutiliza o mesmo tipo de erro para acionar o fallback no frontend
        throw new Error('GEMINI_QUOTA_EXCEEDED');
    }
    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return response.json();
};

const getPrompt = () => `
  Analise a imagem em anexo e determine sua veracidade. A imagem pode ser uma captura de tela de notícia, um meme, uma montagem ou qualquer outro conteúdo visual.

  Sua resposta DEVE ser um objeto JSON válido, sem nenhum texto ou formatação adicional. Siga estritamente este formato:
  {
    "percentual_veracidade": <um número de 0 a 100 representando a chance da informação ser verdadeira>,
    "resumo": "<um resumo conciso da sua análise, explicando o porquê do percentual>",
    "fontes_confiaveis": [
      "<link para uma fonte confiável que confirma ou desmente a informação>",
      "<link para outra fonte, se aplicável>"
    ]
  }

  Seja cético e baseie sua análise em fatos verificáveis. Se a imagem for humorística ou claramente uma sátira, atribua um percentual baixo e explique no resumo. Se não houver informações suficientes para uma análise conclusiva, atribua um percentual próximo de 50 e justifique.
`;

async function analyzeWithGemini(imageBase64: string, mimeType: string, { GEMINI_API_KEY }: Bindings): Promise<AnalysisResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{
      parts: [
        { text: getPrompt() },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
      ]
    }],
    generationConfig: { response_mime_type: "application/json" }
  };

  const data = await createApiCall(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };

  return JSON.parse(data.candidates[0].content.parts[0].text);
}

async function analyzeWithGrok(imageBase64: string, mimeType: string, { XAI_API_KEY }: Bindings): Promise<AnalysisResult> {
  // NOTA: A API do Grok para visão ainda não é pública. Esta é uma implementação hipotética baseada em padrões de outras APIs.
  const url = `https://api.x.ai/v1/chat/completions`;
  const body = {
    model: "grok-vision-large", // Modelo hipotético
    messages: [{ role: "user", content: [{ type: "text", text: getPrompt() }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] }],
    response_format: { type: "json_object" }
  };
  const data = await createApiCall(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_API_KEY}` }, body: JSON.stringify(body) }) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(data.choices[0].message.content);
}

async function analyzeWithOpenRouter(imageBase64: string, mimeType: string, { OPENROUTER_API_KEY }: Bindings): Promise<AnalysisResult> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const body = {
    model: 'openrouter/auto', // Usa o modelo gratuito padrão do OpenRouter
    messages: [{ role: 'user', content: [{ type: 'text', text: getPrompt() }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] }],
    response_format: { type: "json_object" }
  };
  const data = await createApiCall(url, { method: 'POST', headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(data.choices[0].message.content);
}

// --- FUNÇÕES DE BANCO DE DADOS ---

async function getUserCredits(db: D1Database, userId: string): Promise<UserCredits> {
  const { results } = await db.prepare("SELECT credits FROM users WHERE id = ?").bind(userId).all<{ credits: string | number | null }>();
  if (!results || results.length === 0) throw new Error("Usuário não encontrado para buscar créditos.");
  
  const creditsValue = results[0].credits;

  if (typeof creditsValue === 'number') {
    // Trata o schema antigo onde 'credits' era um INTEGER
    return { gemini: creditsValue, grok: 5, openrouter: 10 };
  }

  const creditsString = creditsValue || '{}';
  try {
    const parsed = JSON.parse(creditsString);
    // Garante que todos os créditos existam no objeto
    return {
      gemini: parsed.gemini ?? 5,
      grok: parsed.grok ?? 5,
      openrouter: parsed.openrouter ?? 10,
    };
  } catch {
    // Fallback para dados corrompidos ou formato inesperado
    return { gemini: 5, grok: 5, openrouter: 10 };
  }
}

async function updateUserCredits(db: D1Database, userId: string, provider: 'gemini' | 'grok' | 'openrouter'): Promise<void> {
  const currentCredits = await getUserCredits(db, userId);
  if (provider === 'gemini' && currentCredits.gemini > 0) {
    currentCredits.gemini -= 1;
  } else if (provider === 'grok' && currentCredits.grok > 0) {
    currentCredits.grok -= 1;
  } else if (provider === 'openrouter' && currentCredits.openrouter > 0) {
    currentCredits.openrouter -= 1;
  } else {
    throw new Error(`Créditos insuficientes para o provedor ${provider}.`);
  }
  await db.prepare("UPDATE users SET credits = ? WHERE id = ?").bind(JSON.stringify(currentCredits), userId).run();
}
export default app;