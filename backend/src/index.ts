import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GoogleGenerativeAI } from '@google/generative-ai'

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  GEMINI_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors())

app.get('/', (c) => {
  return c.text('API do Verificador de Fake News operante!')
})

// Rota de Cadastro Original (sem e-mail)
app.post('/api/register', async (c) => {
  try {
    const body = await c.req.json()
    const { name, email, password } = body

    if (!name || !email || !password) {
      return c.json({ error: 'Todos os campos são obrigatórios' }, 400)
    }

    const password_hash = password + "_hashed" 
    const id = crypto.randomUUID()

    const { success } = await c.env.DB.prepare(
      `INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`
    ).bind(id, name, email, password_hash).run()

    if (!success) {
      return c.json({ error: 'Erro ao criar usuário no banco ou e-mail já cadastrado.' }, 500)
    }

    return c.json({ 
      message: 'Cadastro realizado com sucesso!',
      user: { id, name, credits: 5 }
    }, 201)

  } catch (error: any) {
    return c.json({ error: 'Erro no servidor ou e-mail já cadastrado.', details: error.message }, 500)
  }
})

// Rota de Login Original (sem bloqueio de verificação)
app.post('/api/login', async (c) => {
  try {
    const body = await c.req.json()
    const { email, password } = body

    if (!email || !password) {
      return c.json({ error: 'E-mail e senha são obrigatórios' }, 400)
    }

    const password_hash = password + "_hashed"

    const user = await c.env.DB.prepare(
      `SELECT id, name, credits FROM users WHERE email = ? AND password_hash = ?`
    ).bind(email, password_hash).first<{ id: string, name: string, credits: number }>()

    if (!user) {
      return c.json({ error: 'E-mail ou senha inválidos' }, 401)
    }

    return c.json({
      message: 'Login realizado com sucesso!',
      user: {
        id: user.id,
        name: user.name,
        credits: user.credits
      }
    }, 200)

  } catch (error) {
    return c.json({ error: 'Erro no servidor ao realizar login' }, 500)
  }
})

// Rota Principal: Receber imagem e verificar Fake News
app.post('/api/verify', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body['image']
    const userId = body['userId'] 

    if (!userId) {
      return c.json({ error: 'ID do usuário não fornecido' }, 400)
    }

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Nenhuma imagem foi enviada ou formato inválido' }, 400)
    }

    let user = await c.env.DB.prepare(
      `SELECT credits FROM users WHERE id = ?`
    ).bind(userId).first<{ credits: number }>()

    if (!user) {
      return c.json({ error: 'Usuário não encontrado' }, 404)
    }

    if (user.credits <= 0) {
      return c.json({ error: 'Créditos insuficientes. Faça upgrade do seu plano.' }, 403)
    }

    const fileExtension = file.name.split('.').pop()
    const uniqueFileName = `${userId}-${Date.now()}.${fileExtension}`
    const arrayBuffer = await file.arrayBuffer()

    await c.env.BUCKET.put(uniqueFileName, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    })

    const imageUrl = `https://seu-futuro-dominio.com/${uniqueFileName}`

    const genAI = new GoogleGenerativeAI(c.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" })

    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64Data = btoa(binary)

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: file.type
      }
    }

    const prompt = `Você é um auditor especializado em fact-checking.
    Analise a imagem anexada (pode ser captura de tela, notícia, meme ou montagem).
    1. Identifique a principal alegação ou texto.
    2. Avalie a veracidade com base em fatos reais e contexto.
    3. Retorne EXATAMENTE e APENAS um objeto JSON válido, sem marcação markdown, com as seguintes chaves:
    {
      "percentual_veracidade": <numero inteiro de 0 a 100>,
      "resumo": "<resumo direto da análise em até 3 frases>",
      "fontes_confiaveis": ["<fonte real 1>", "<fonte real 2>"]
    }`

    const aiResponse = await model.generateContent([prompt, imagePart])
    const aiText = aiResponse.response.text()

    let analysisResult
    try {
      const cleanedText = aiText.replace(/```json/g, '').replace(/```/g, '').trim()
      analysisResult = JSON.parse(cleanedText)
    } catch (e) {
      return c.json({ error: 'Erro ao processar a resposta da IA', details: aiText }, 500)
    }

    await c.env.DB.prepare(
      `UPDATE users SET credits = credits - 1 WHERE id = ?`
    ).bind(userId).run()

    const verificationId = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO verifications (id, user_id, image_url, authenticity_score, summary, sources) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      verificationId,
      userId,
      imageUrl,
      analysisResult.percentual_veracidade,
      analysisResult.resumo,
      JSON.stringify(analysisResult.fontes_confiaveis)
    ).run()

    return c.json({
      message: 'Análise concluída com sucesso!',
      analysis: analysisResult,
      imageUrl: imageUrl,
      remainingCredits: user.credits - 1
    }, 200)

 } catch (error: any) {
    console.error("ERRO REAL DETECTADO:", error) 
    return c.json({ 
      error: 'Erro ao processar o arquivo', 
      details: error.message 
    }, 500)
  }
})

export default app