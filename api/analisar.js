import { GoogleGenerativeAI } from '@google/generative-ai';

// O prompt do sistema pode ficar aqui fora, é só texto
const systemPrompt = `Você é um assistente de advocacia especialista em expurgos inflacionários (Planos Bresser, Verão, Collor I, Collor II).
Sua tarefa é analisar a(s) IMAGEM(NS) de um extrato de poupança antigo (via OCR) e extrair dados-chave para um formato JSON.
É crucial que você associe *corretamente* cada plano à sua respectiva agência e conta.
EXTRAIA O NOME DO TITULAR EXATAMENTE COMO APARECE, EM MAIÚSCULAS.

Regras de Leitura Específicas:
1.  **Plano Bresser (Jun/1987):**
    * O saldo correto é o "SALDO ATUAL" que aparece no extrato de Junho/1987 (que inclui a correção do período).
    * No extrato "PLAUDEZIR FELISBERTO DE ABREU", o saldo base correto é 27.146,51.
2.  **Plano Verão (Jan/1989):**
    * Saldo correto: "SDO. ANTERIOR" de Jan/89 (ou Saldo Final de Dez/88), ANTES da correção de Fev/89.
    * Atenção à conversão de moeda (Cz$ para NCz$, corte de 3 zeros). O saldo deve ser em NCz$ (Ex: Cz$ 230.320,00 vira 230,32).
    * "Dia Base" é o dia do crédito em Jan/89.
3.  **Plano Collor II (Jan/1991):**
    * Saldo correto: "SDO. ANTERIOR" de Jan/91 (ou Saldo Final de Dez/90).
    * Exceção (Caso Eliete da Silva): Se o saldo anterior for zero, mas houver um depósito no "Dia Base" em Jan/91 (ex: "210191 21 DEP. DINHEIRO 80.000,00"), use o valor desse primeiro depósito como saldo base.
    * Exclusão (Caso Fabio/Adilson): Preste atenção se o "Dia Base" é 01 ou 02.
4.  **Geral:**
    * Se o saldo for "0,00", extraia "0,00".
    * Ignore planos onde o saldo é "Não Identificado".

Formato da Resposta:
Responda *apenas* com um objeto JSON válido, seguindo este formato exato:
{
  "titular": "...",
  "banco": "...",
  "planos": [
    { "nomePlano": "...", "agencia": "...", "conta": "...", "saldoExtrato": "...", "dataBaseAniversario": "..." }
  ]
}

Se um campo não for encontrado, retorne "Não Identificado".`;

// Esta é a função que o Vercel vai rodar
export default async function handler(req, res) {
    
    // 1. Checa o método da requisição primeiro
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // --- CORREÇÃO ---
    // Movemos a inicialização da API para DENTRO da função
    // para garantir que o "Cofre" (process.env) esteja pronto.
    
    // 2. Pega a chave de API (que o Vercel coloca aqui)
    const apiKey = process.env.GEMINI_API_KEY;
    
    // 3. Validação da Chave
    if (!apiKey) {
        console.error("Erro: Chave de API (GEMINI_API_KEY) não encontrada.");
        return res.status(500).json({ error: 'Configuração do servidor incompleta: Chave de API não encontrada.' });
    }

    // 4. Inicializa o Google AI
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 5. Inicializa o Modelo
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt
    });
    // --- FIM DA CORREÇÃO ---

    try {
        // 6. Pega os dados que o HTML enviou
        const { base64ImageArray, mimeType } = req.body;

        if (!base64ImageArray || base64ImageArray.length === 0) {
            return res.status(400).json({ error: "Nenhuma imagem recebida." });
        }

        // 7. Formata as imagens para a API
        const imageParts = base64ImageArray.map(base64Image => ({
            inlineData: {
                mimeType: mimeType,
                data: base64Image
            }
        }));

        const promptParts = [
            "Analise esta(s) IMAGEM(NS) de extrato e retorne o JSON com os dados, conforme suas instruções.",
            ...imageParts
        ];

        // 8. Chama a API do Gemini
        const result = await model.generateContent({
            contents: [{ role: "user", parts: promptParts }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0,
            }
        });

        // 9. Envia a resposta de volta para o HTML
        const response = result.response;
        const jsonText = response.text();
        res.status(200).json(JSON.parse(jsonText));

    } catch (error) {
        console.error("Erro na função da API:", error);
        res.status(500).json({ error: `Erro no servidor: ${error.message}` });
    }
}
