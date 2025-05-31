const axios = require('axios');

const AREA_CODES = {
  '서울': 1, '부산': 6, '제주': 39, '강릉': 32,
  '전주': 37, '대구': 4, '광주': 5, '대전': 3
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const region = req.query.region || '서울';
    const apiKey = process.env.KOREA_TOURISM_API_KEY;
    
    if (!apiKey) {
      return res.json({
        success: true,
        data: { 
          region, 
          attractions: [
            {title: `${region} 대표 관광지`, category: '문화관광지'},
            {title: `${region} 자연공원`, category: '자연관광지'},
            {title: `${region} 역사유적`, category: '역사관광지'}
          ],
          events: [
            {title: `${region} 문화축제`, location: region},
            {title: `${region} 음식축제`, location: region}
          ],
          attractionCount: 3,
          eventCount: 2,
          message: 'API 키 설정 필요 - 샘플 데이터' 
        }
      });
    }

    const areaCode = AREA_CODES[region] || 1;

    const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/areaBasedList1', {
      params: {
        serviceKey: apiKey,
        numOfRows: 10,
        pageNo: 1,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        listYN: 'Y',
        arrange: 'A',
        contentTypeId: 12, // 관광지
        areaCode: areaCode
      },
      timeout: 10000
    });

    if (!response.data || !response.data.response || response.data.response.header.resultCode !== '0000') {
      throw new Error('관광정보 API 응답 오류');
    }

    const items = response.data.response.body?.items?.item || [];
    
    const attractions = items.slice(0, 5).map(item => ({
      title: item.title || '관광지',
      category: item.cat3 || item.cat2 || '관광지',
      address: item.addr1 || '',
      tel: item.tel || '',
      image: item.firstimage || null
    }));

    // 기본값 설정
    if (attractions.length === 0) {
      attractions.push(
        {title: `${region} 대표 관광지`, category: '문화관광지'},
        {title: `${region} 자연공원`, category: '자연관광지'}
      );
    }

    // 샘플 이벤트 데이터
    const events = [
      { title: `${region} 문화축제`, location: region, date: '2025-06-01' },
      { title: `${region} 음식축제`, location: region, date: '2025-06-15' }
    ];

    return res.json({
      success: true,
      data: {
        region,
        attractions,
        events,
        attractionCount: attractions.length, // 이것이 중요!
        eventCount: events.length, // 이것이 중요!
        message: '🏛️ 관광 정보 (일부 샘플 데이터 포함)',
        time: new Date().toLocaleString('ko-KR')
      }
    });

  } catch (error) {
    return res.json({
      success: true,
      data: {
        region: req.query.region || '서울',
        attractions: [
          { title: '대체 관광지 1', category: '문화관광지' },
          { title: '대체 관광지 2', category: '자연관광지' }
        ],
        events: [
          { title: '대체 행사 1', location: req.query.region || '서울' }
        ],
        attractionCount: 2, // 명시적으로 숫자 설정
        eventCount: 1, // 명시적으로 숫자 설정
        message: `⚠️ 대체 데이터: ${error.message}`,
        time: new Date().toLocaleString('ko-KR')
      }
    });
  }
};
