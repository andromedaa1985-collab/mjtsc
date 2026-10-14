import { db, auth, getAiRequestHeaders } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { beginApiConnectionRequest, waitForApiOperation } from './apiConnection';
import { serializeAiRequest } from './requestBudget';

export async function generateGeminiContent(prompt: string, imageBase64?: string, mimeType?: string, signal?: AbortSignal) {
  let request: ReturnType<typeof beginApiConnectionRequest> | undefined;
  try {
    const userId = auth.currentUser?.uid;
    if (userId) request = beginApiConnectionRequest('gemini', userId);
    const requestSignal = AbortSignal.any([...(request ? [request.signal] : []), AbortSignal.timeout(310000), ...(signal ? [signal] : [])]);
    const headers = await waitForApiOperation(getAiRequestHeaders, requestSignal);
    if (!userId || auth.currentUser?.uid !== userId) throw new Error('账号已切换，请重新发起生成。');
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers,
      signal: requestSignal,
      body: serializeAiRequest({
        prompt,
        imageBase64,
        mimeType,
        ...(request.apiConfig ? { apiConfig: request.apiConfig } : {}),
      })
    });

    const data = await response.json().catch(() => null);
    if (request.signal.aborted) throw new DOMException('账号已切换，请重新发起生成。', 'AbortError');
    if (!response.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'AI 服务暂时不可用，请稍后重试。');
    }
    if (typeof data?.content !== 'string' || !data.content.trim()) {
      throw new Error('AI 没有返回有效内容，请重试。');
    }
    const content = data.content;
    const usage = data.usage;

    // Deduct credits automatically
    if (data.billingSource !== 'user' && auth.currentUser?.uid === userId && Number.isSafeInteger(usage?.totalTokenCount) && usage.totalTokenCount > 0) {
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
    if (signal?.aborted) throw new DOMException('生成已停止，已完成内容保留。', 'AbortError');
    if (request?.signal.aborted) throw new DOMException('账号已切换，请重新发起生成。', 'AbortError');
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('AI 响应超时，请稍后重试。');
    }
    throw error;
  } finally { request?.release(); }
}
