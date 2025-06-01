const axios = require('axios');

const REGION_MAPPING = {
  '서울': '서울', '부산': '부산', '제주': '제주', '강릉': '강원',
  '전주': '전북', '대구': '대구', '광주': '광주', '대전': '대전'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const region = req.query.region || '서울';
    
    // === 모든 환경변수 체크 ===
    console.log('🔑 환경변수 전체 체크:', {
      AIR_KOREA_API_KEY: !!process.env.AIR_KOREA_API_KEY,
      TOURISM_API_KEY: !!process.env.TOURISM_API_KEY,
      WEATHER_API_KEY: !!process.env.WEATHER_API_KEY,
      // 다른 가능한 이름들
      ENVIRONMENT_API_KEY: !!process.env.ENVIRONMENT_API_KEY,
      AIR_API_KEY: !!process.env.AIR_API_KEY
    });
    
    // 기존 키로 시도
    let apiKey = process.env.AIR_KOREA_API_KEY;
    
    // 없으면 다른 키들 시도
    if (!apiKey) {
      apiKey = process.env.TOURISM_API_KEY; // 같은 키일 수도
      console.log('🔄 TOURISM_API_KEY로 시도...');
    }
    
    if (!apiKey) {
      console.log('❌ 모든 API 키 없음');
      return res.json({
        success: true,
        data: { 
          region, 
          pm10: 35, 
          pm25: 18, 
          status: '보통', 
          message: '⚠️ 대기질 API 키 설정 필요',
          availableKeys: Object.keys(process.env).filter(key => key.includes('API'))
        }
      });
    }

    console.log('✅ API 키 발견, 대기질 API 시도...');
    
    const sidoName = REGION_MAPPING[region] || '서울';

    const response = await axios.get('http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty', {
      params: {
        serviceKey: apiKey,
        returnType: 'json',
        numOfRows: 10,
        pageNo: 1,
        sidoName: sidoName,
        ver: '1.0'
      },
      timeout: 8000
    });

    console.log('📊 대기질 API 응답:', {
      status: response.status,
      contentType: response.headers['content-type'],
      isJSON: response.headers['content-type']?.includes('json'),
      resultCode: response.data?.response?.header?.resultCode
    });

    if (!response.data || !response.data.response || response.data.response.header.resultCode !== '00') {
      throw new Error(`대기질 API 응답 오류: ${response.data?.response?.header?.resultMsg || '알 수 없는 오류'}`);
    }

    const items = response.data.response.body?.items || [];
    const item = items[0];
    
    if (!item) {
      throw new Error('대기질 데이터 없음');
    }

    const pm10 = parseFloat(item.pm10Value) || null;
    const pm25 = parseFloat(item.pm25Value) || null;
    
    let status = '정보 없음';
    if (pm10 !== null) {
      if (pm10 <= 30) status = '좋음';
      else if (pm10 <= 80) status = '보통';
      else if (pm10 <= 150) status = '나쁨';
      else status = '매우나쁨';
    }

    console.log('🎉 대기질 데이터 성공:', { pm10, pm25, status });

    return res.json({
      success: true,
      data: {
        region,
        pm10,
        pm25,
        status,
        stationName: item.stationName,
        dataTime: item.dataTime,
        message: '🌬️ 실시간 대기질 데이터',
        time: new Date().toLocaleString('ko-KR'),
        apiKeyUsed: apiKey ? 'found' : 'not_found'
      }
    });

  } catch (error) {
    console.error('❌ 대기질 API 오류:', error.message);
    return res.json({
      success: true,
      data: {
        region: req.query.region || '서울',
        pm10: 35,
        pm25: 18,
        status: '보통',
        message: `⚠️ 대체 데이터: ${error.message}`,
        time: new Date().toLocaleString('ko-KR')
      }
    });
  }
};
