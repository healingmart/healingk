const axios = require('axios');

const REGION_MAPPING = {
  '서울': '서울', '부산': '부산', '제주': '제주', '강릉': '강원',
  '전주': '전북', '대구': '대구', '광주': '광주', '대전': '대전'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const region = req.query.region || '서울';
    const apiKey = process.env.AIR_KOREA_API_KEY;
    
    if (!apiKey) {
      return res.json({
        success: true,
        data: { region, pm10: 30, pm25: 15, status: '좋음', message: 'API 키 설정 필요' }
      });
    }

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

    if (!response.data || !response.data.response || response.data.response.header.resultCode !== '00') {
      throw new Error('대기질 API 응답 오류');
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
        time: new Date().toLocaleString('ko-KR')
      }
    });

  } catch (error) {
    return res.json({
      success: true,
      data: {
        region: req.query.region || '서울',
        pm10: 30,
        pm25: 15,
        status: '보통',
        message: `⚠️ 대체 데이터: ${error.message}`,
        time: new Date().toLocaleString('ko-KR')
      }
    });
  }
};
