// 利用回数管理のユーティリティ関数
import axios from 'axios';

// ユーザーの利用回数情報を取得
export const fetchUserUsage = async (userEmail, FIRESTORE_API_URL) => {
  try {
    const res = await axios.get(`${FIRESTORE_API_URL}/userUsage/${userEmail}`);
    if (res.data.fields) {
      return {
        currentUsage: parseInt(res.data.fields.currentUsage?.integerValue ?? '0', 10),
        monthlyLimit: parseInt(res.data.fields.monthlyLimit?.integerValue ?? '0', 10),
        lastResetDate: res.data.fields.lastResetDate?.stringValue || null,
        updatedAt: res.data.fields.updatedAt?.timestampValue || null
      };
    }
  } catch (error) {
    if (error.response?.status === 404) {
      // ユーザーのデータが存在しない場合はデフォルト値を返す
      return {
        currentUsage: 0,
        monthlyLimit: 0,
        lastResetDate: null,
        updatedAt: null
      };
    }
    throw error;
  }
};

// ユーザーの利用回数をインクリメント
export const incrementUserUsage = async (userEmail, FIRESTORE_API_URL) => {
  const currentUsage = await fetchUserUsage(userEmail, FIRESTORE_API_URL);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  // 月が変わった場合はリセット
  let newUsage = currentUsage.currentUsage;
  if (currentUsage.lastResetDate !== currentMonth) {
    newUsage = 0;
  }
  
  const updatedData = {
    fields: {
      currentUsage: { integerValue: newUsage + 1 },
      monthlyLimit: { integerValue: currentUsage.monthlyLimit },
      lastResetDate: { stringValue: currentMonth },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  await axios.patch(`${FIRESTORE_API_URL}/userUsage/${userEmail}`, updatedData);
  return {
    currentUsage: newUsage + 1,
    monthlyLimit: currentUsage.monthlyLimit,
    lastResetDate: currentMonth,
    updatedAt: new Date().toISOString()
  };
};

// 利用回数の上限チェック
export const checkUsageLimit = (currentUsage, monthlyLimit) => {
  return currentUsage >= monthlyLimit;
};

// 新規ユーザーのuserUsageドキュメントを初期化
export const createUserUsage = async (userEmail, FIRESTORE_API_URL) => {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  const initialData = {
    fields: {
      currentUsage: { integerValue: 0 },
      monthlyLimit: { integerValue: 0 }, // デフォルト0回
      lastResetDate: { stringValue: currentMonth },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  try {
    await axios.patch(`${FIRESTORE_API_URL}/userUsage/${userEmail}`, initialData);
    return {
      currentUsage: 0,
      monthlyLimit: 0,
      lastResetDate: currentMonth,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('userUsage初期化エラー:', error);
    throw error;
  }
};

// 管理者による利用回数制限の更新
export const updateUserUsageLimit = async (userEmail, newLimit, FIRESTORE_API_URL) => {
  // まずユーザーデータの存在確認・作成
  let currentUsage;
  try {
    currentUsage = await fetchUserUsage(userEmail, FIRESTORE_API_URL);
  } catch (error) {
    // ユーザーデータが存在しない場合は初期化
    console.log(`ユーザー ${userEmail} のデータが存在しないため初期化します`);
    currentUsage = await createUserUsage(userEmail, FIRESTORE_API_URL);
  }
  
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  const updatedData = {
    fields: {
      currentUsage: { integerValue: currentUsage.currentUsage },
      monthlyLimit: { integerValue: newLimit },
      lastResetDate: { stringValue: currentUsage.lastResetDate || currentMonth },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  await axios.patch(`${FIRESTORE_API_URL}/userUsage/${userEmail}`, updatedData);
  return {
    currentUsage: currentUsage.currentUsage,
    monthlyLimit: newLimit,
    lastResetDate: currentUsage.lastResetDate || currentMonth,
    updatedAt: new Date().toISOString()
  };
};

// 全ユーザーの利用回数情報を取得（管理者用）
export const fetchAllUsersUsage = async (FIRESTORE_API_URL) => {
  try {
    const res = await axios.get(`${FIRESTORE_API_URL}/userUsage`);
    if (res.data.documents) {
      return res.data.documents.map(doc => {
        const userEmail = doc.name.split('/').pop();
        return {
          email: userEmail,
          currentUsage: parseInt(doc.fields.currentUsage?.integerValue ?? '0', 10),
          monthlyLimit: parseInt(doc.fields.monthlyLimit?.integerValue ?? '0', 10),
          lastResetDate: doc.fields.lastResetDate?.stringValue || null,
          updatedAt: doc.fields.updatedAt?.timestampValue || null
        };
      });
    }
    return [];
  } catch (error) {
    console.error('全ユーザー利用回数取得エラー:', error);
    return [];
  }
};

// ユーザーの利用回数をリセット（管理者用）
export const resetUserUsage = async (userEmail, FIRESTORE_API_URL) => {
  const currentUsage = await fetchUserUsage(userEmail, FIRESTORE_API_URL);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  const updatedData = {
    fields: {
      currentUsage: { integerValue: 0 },
      monthlyLimit: { integerValue: currentUsage.monthlyLimit },
      lastResetDate: { stringValue: currentMonth },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  await axios.patch(`${FIRESTORE_API_URL}/userUsage/${userEmail}`, updatedData);
  return {
    currentUsage: 0,
    monthlyLimit: currentUsage.monthlyLimit,
    lastResetDate: currentMonth,
    updatedAt: new Date().toISOString()
  };
};
