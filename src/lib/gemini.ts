import { db, auth, getAiRequestHeaders } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';

export async function generateGeminiContent(prompt: string, imageBase64?: string, mimeType?: string) {
  try {
    const userId = auth.currentUser?.uid;
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: await getAiRequestHeaders(),
      signal: AbortSignal.timeout(310000),
      body: JSON.stringify({
        prompt,
        imageBase64,
        mimeType
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'AI 服务暂时不可用，请稍后重试。');
    }
    if (typeof data?.content !== 'string' || !data.content.trim()) {
      throw new Error('AI 没有返回有效内容，请重试。');
    }
    const content = data.content;
    const usage = data.usage;

    // Deduct credits automatically
    if (userId && Number.isSafeInteger(usage?.totalTokenCount) && usage.totalTokenCount > 0) {
      try {
        const userRef = doc(db, 'users', userId);
        // Trial usage accounting only. Payment and billable quotas belong on a trusted server.
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userRef);
          const remaining = snapshot.data()?.credits;
          if (Number.isSafeInteger(remaining)) {
            transaction.update(userRef, { credits: Math.max(0, remaining - usage.totalTokenCount) });
          }
        });
      } catch (e) {
        console.warn('试用额度记录暂时未同步。');
      }
    }
    
    return content;
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('AI 响应超时，请稍后重试。');
    }
    console.error('Gemini API call failed:', error);
    throw error;
  }
}
