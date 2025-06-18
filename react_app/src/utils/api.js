import axios from 'axios';

export const sortHistory = (historyArray) => {
  return historyArray.sort((a, b) => {
    const subjectComparison = a.subject.localeCompare(b.subject);
    if (subjectComparison !== 0) {
      return subjectComparison;
    }
    return b.createdAt > a.createdAt ? 1 : -1;
  });
};

export const saveUserProfile = async (profile, uid, FIRESTORE_API_URL, setUserProfile, setGrade) => {
  if (!uid) return;
  try {
    const data = {
      fields: {
        name: { stringValue: profile.name || "" },
        nickname: { stringValue: profile.nickname || "" },
        weakSubjects: {
          arrayValue: {
            values: (profile.weakSubjects || []).map(s => ({ stringValue: s }))
          }
        },
        preferredGrade: { stringValue: profile.preferredGrade || "小学生" },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };
    await axios.patch(`${FIRESTORE_API_URL}/userProfiles/${uid}`, data);
    setUserProfile && setUserProfile(profile);
    setGrade && setGrade(profile.preferredGrade);
  } catch (e) {
    console.error('プロファイル保存エラー:', e);
  }
};

export const fetchHistory = async (uid, FIRESTORE_API_URL, setHistory, sortHistory) => {
  if (!uid) return;
  try {
    const res = await axios.get(`${FIRESTORE_API_URL}/questionThreads`);
    if (res.data.documents && Array.isArray(res.data.documents)) {
      const historyArr = res.data.documents
        .map(doc => {
          const threadArr = doc.fields.thread?.arrayValue?.values || [];
          return {
            id: doc.name.split('/').pop(),
            question: doc.fields.question?.stringValue || '',
            answer: doc.fields.answer?.stringValue || '',
            createdAt: doc.fields.createdAt?.stringValue || doc.fields.createdAt?.timestampValue || '',
            grade: doc.fields.grade?.stringValue || '',
            subject: doc.fields.subject?.stringValue || '数学',
            uid: doc.fields.uid?.stringValue || '',
            thread: threadArr.map(t => ({
              question: t.mapValue.fields.q.stringValue,
              answer: t.mapValue.fields.a.stringValue,
              createdAt: t.mapValue.fields.createdAt.stringValue
            }))
          };
        })
        .filter(item => item.uid === uid && item.question && item.answer);
      const sortedHistory = sortHistory(historyArr);
      setHistory && setHistory(sortedHistory);
    } else {
      setHistory && setHistory([]);
    }
  } catch (e) { setHistory && setHistory([]); }
};

export const fetchUserProfile = async (uid, FIRESTORE_API_URL, setUserProfile, setGrade, saveUserProfile) => {
  if (!uid) return;
  try {
    const res = await axios.get(`${FIRESTORE_API_URL}/userProfiles/${uid}`);
    if (res.data.fields) {
      const profile = {
        name: res.data.fields.name?.stringValue || "",
        nickname: res.data.fields.nickname?.stringValue || "",
        weakSubjects: res.data.fields.weakSubjects?.arrayValue?.values?.map(v => v.stringValue) || [],
        preferredGrade: res.data.fields.preferredGrade?.stringValue || "小学生"
      };
      setUserProfile && setUserProfile(profile);
      setGrade && setGrade(profile.preferredGrade);
    }
  } catch (e) {
    // プロファイルが存在しない場合は初期値で作成
    const defaultProfile = {
      name: "",
      nickname: "",
      weakSubjects: [],
      preferredGrade: "小学生"
    };
    try {
      await saveUserProfile(defaultProfile, uid, FIRESTORE_API_URL, setUserProfile, setGrade);
    } catch (createError) {
      console.error('初期プロファイル作成エラー:', createError);
    }
  }
};
