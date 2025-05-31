const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const region = req.query.region || '서울';
    const baseUrl = req.headers.host ? `https://${req.headers.host}` : '';
    
    // 병렬로 모든 데이터 요청
    const [weatherRes, airRes, tourismRes] = await Promise.allSettled([
      axios.get(`${baseUrl}/api/weather?region=${region}`, { timeout: 5000 }),
      axios.get(`${baseUrl}/api/air-quality?region=${region}`, { timeout: 5000 }),
      axios.get(`${baseUrl}/api/tourism?region=${region}`, { timeout: 5000 })
    ]);

    const weather = weatherRes.status === 'fulfilled' ? weatherRes.value.data.data : null;
    const airQuality = airRes.status === 'fulfilled' ? airRes.value.data.data : null;
    const tourism = tourismRes.status === 'fulfilled' ? tourismRes.value.data.data : null;

    // 종합 점수 계산
    let score = 0;
    let factors = [];
    
    if (weather) {
      if (weather.temperature >= 15 && weather.temperature <= 25) {
        score += 30;
        factors.push('쾌적한 기온');
      }
      if (weather.sky === '맑음') {
        score += 25;
        factors.push('맑은 날씨');
      }
      if (weather.precipitation === '없음') {
        score += 20;
        factors.push('강수 없음');
      }
    }
    
    if (airQuality) {
      if (airQuality.status === '좋음') {
        score += 25;
        factors.push('좋은 대기질');
      } else if (airQuality.status === '보통') {
        score += 15;
      }
    }

    let grade = 'F';
    if (score >= 80) grade = 'S';
    else if (score >= 70) grade = 'A';
    else if (score >= 60) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 40) grade = 'D';

    return res.json({
      success: true,
      data: {
        region,
        weather,
        airQuality,
        tourism,
        score: Math.round(score),
        grade,
        factors: factors.slice(0, 3),
        recommendation: score >= 70 ? '추천' : score >= 50 ? '보통' : '비추천',
        message: '🌟 통합 관광 정보',
        time: new Date().toLocaleString('ko-KR')
      }
    });

  } catch (error) {
    return res.json({
      success: false,
      error: error.message,
      message: '통합 데이터 조회 실패'
    });
  }
};
