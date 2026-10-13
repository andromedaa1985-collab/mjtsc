import { db, auth, getAiRequestHeaders } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';

export async function generateDeepSeekContent(prompt: string, isJson: boolean = false) {
  try {
    const userId = auth.currentUser?.uid;
    const response = await fetch('/api/deepseek', {
      method: 'POST',
      headers: await getAiRequestHeaders(),
      signal: AbortSignal.timeout(310000),
      body: JSON.stringify({
        messages: [
          { role: 'user', content: prompt }
        ],
        responseFormat: isJson ? { type: 'json_object' } : { type: 'text' }
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'AI 服务暂时不可用，请稍后重试。');
    }
    if (typeof data?.content !== 'string' || !data.content.trim()) {
      throw new Error('AI 没有返回有效内容，请重试。');
    }
    let content = data.content;
    const usage = data.usage;
    
    if (isJson && content) {
      // Remove markdown code block syntax if DeepSeek includes it despite json_object mode
      content = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    }

    // Deduct credits automatically
    if (userId && Number.isSafeInteger(usage?.total_tokens) && usage.total_tokens > 0) {
      try {
        const userRef = doc(db, 'users', userId);
        // Trial usage accounting only. Payment and billable quotas belong on a trusted server.
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userRef);
          const remaining = snapshot.data()?.credits;
          if (Number.isSafeInteger(remaining)) {
            transaction.update(userRef, { credits: Math.max(0, remaining - usage.total_tokens) });
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
    console.error('DeepSeek API call failed:', error);
    throw error;
  }
}
