const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const region = req.query.region || '서울';
    const apiKey = process.env.WEATHER_API_KEY;
    
    if (!apiKey) {
      return res.json({
        success: true,
        data: { region, temperature: 20, sky: '맑음', message: 'API 키 설정 필요' }
      });
    }

    const coordinates = { '서울': {nx:60, ny:127}, '부산': {nx:98, ny:76}, '제주': {nx:52, ny:38} };
    const coord = coordinates[region] || coordinates['서울'];
    
    const now = new Date();
    const kst = new Date(now.getTime() + 9*60*60*1000);
    const baseDate = kst.toISOString().slice(0,10).replace(/-/g, '');
    const baseTime = '0500';

    const response = await axios.get('http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst', {
      params: {
        serviceKey: apiKey,
        numOfRows: 100,
        pageNo: 1,
        dataType: 'JSON',
        base_date: baseDate,
        base_time: baseTime,
        nx: coord.nx,
        ny: coord.ny
      },
      timeout: 8000
    });

    if (!response.data || !response.data.response || response.data.response.header.resultCode !== '00') {
      throw new Error(response.data?.response?.header?.resultMsg || 'API 응답 오류');
    }

    const items = response.data.response.body?.items?.item || [];
    let temperature = 20;
    let sky = '맑음';
    
    items.forEach(item => {
      if (item.category === 'TMP') temperature = parseFloat(item.fcstValue);
      if (item.category === 'SKY') {
        sky = item.fcstValue === '1' ? '맑음' : item.fcstValue === '3' ? '구름많음' : '흐림';
      }
    });

    return res.json({
      success: true,
      data: {
        region,
        temperature,
        sky,
        precipitation: '없음',
        message: '🌟 실시간 기상청 데이터',
        time: new Date().toLocaleString('ko-KR')
      }
    });

  } catch (error) {
    return res.json({
      success: true,
      data: {
        region: req.query.region || '서울',
        temperature: 20,
        sky: '맑음',
        precipitation: '없음',
        message: `⚠️ 오류: ${error.message}`,
        time: new Date().toLocaleString('ko-KR')
      }
    });
  }
};
