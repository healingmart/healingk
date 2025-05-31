// api/festivals.js
// 이 파일은 Vercel 서버리스 함수로 배포될 예정입니다.
const axios = require('axios'); // Node.js 환경에서 HTTP 요청을 위한 라이브러리

module.exports = async function handler(req, res) {
  // CORS 설정: 모든 도메인에서의 접근을 허용합니다.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 쿼리 파라미터에서 지역 정보 가져오기 (없으면 'all'로 간주)
    const { region = 'all', status = 'all' } = req.query; // status: ongoing, upcoming, all
    
    // Vercel 환경 변수에서 API 키 가져오기
    const apiKey = process.env.KOREA_TOURISM_API_KEY; 
    
    // API 키가 설정되지 않았을 경우 샘플 데이터 반환
    if (!apiKey) {
      console.warn('KOREA_TOURISM_API_KEY 환경 변수가 설정되지 않았습니다. 샘플 데이터를 반환합니다.');
      return res.status(200).json({
        success: true,
        data: getSampleFestivalsWithStats('all', new Date().toISOString().slice(0,10).replace(/-/g, '')),
        message: '⚠️ API 키 설정 필요 - 샘플 데이터',
        timestamp: new Date().toISOString()
      });
    }

    // 현재 날짜 및 한 달 후 날짜 계산 (YYYYMMDD 형식)
    const today = new Date();
    const todayStr = formatDateRaw(today); // YYYYMMDD
    
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = formatDateRaw(nextMonth); // YYYYMMDD

    // 요청된 지역 코드 설정 (없으면 주요 지역 순회)
    // getAreaCode 함수는 아래 헬퍼 함수에 정의되어 있습니다.
    const areaCodesToFetch = region !== 'all' ? [getAreaCode(region)] : [1, 6, 39, 32, 37, 4, 5, 3]; // 서울, 부산, 제주, 강원, 전북, 대구, 광주, 대전

    // 각 지역별 축제 정보 병렬 조회
    const festivalPromises = areaCodesToFetch.map(async (code) => {
      try {
        const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
          params: {
            serviceKey: decodeURIComponent(apiKey), // API 키 디코딩 필요
            numOfRows: 50, // 각 지역별 가져올 최대 개수
            pageNo: 1,
            MobileOS: 'ETC',
            MobileApp: 'HealingK',
            _type: 'json',
            listYN: 'Y',
            arrange: 'A', // 정렬 방식
            eventStartDate: todayStr, // 오늘부터 한 달 후까지의 축제 조회
            eventEndDate: nextMonthStr,
            areaCode: code // 지역 코드
          },
          timeout: 8000 // 8초 타임아웃
        });

        if (response.data?.response?.header?.resultCode === '0000') {
          return response.data.response.body?.items?.item || [];
        } else {
          console.error(`지역 ${code} 축제 조회 오류:`, response.data?.response?.header?.resultMsg || '알 수 없는 오류');
          return [];
        }
      } catch (error) {
        console.error(`axios 요청 중 오류 (지역 ${code}):`, error.message);
        return []; // 오류 발생 시 빈 배열 반환하여 다음 처리 진행
      }
    });

    const allFestivalResults = await Promise.all(festivalPromises);
    const allFestivals = allFestivalResults.flat(); // 모든 지역의 축제 결과를 하나의 배열로 합침

    // 축제 데이터 가공 및 상태 분류
    const processedFestivals = allFestivals.map(festival => {
      const startDateRaw = festival.eventstartdate;
      const endDateRaw = festival.eventenddate;
      
      // 축제 상태 분류 (진행중, 예정, 종료)
      let festivalStatus = 'upcoming';
      if (startDateRaw <= todayStr && endDateRaw >= todayStr) {
        festivalStatus = 'ongoing';
      } else if (endDateRaw < todayStr) {
        festivalStatus = 'ended';
      }

      return {
        id: festival.contentid,
        title: festival.title || '축제명 없음',
        location: festival.addr1 || festival.eventplace || '장소 미정',
        region: getRegionName(parseInt(festival.areacode)), // 지역 코드를 지역명으로 변환
        startDate: formatDateDisplay(startDateRaw), // 화면 표시용 날짜 포맷
        endDate: formatDateDisplay(endDateRaw), // 화면 표시용 날짜 포맷
        startDateRaw: startDateRaw, // 원본 날짜 (계산용)
        endDateRaw: endDateRaw, // 원본 날짜 (계산용)
        status: festivalStatus,
        tel: festival.tel || '',
        image: festival.firstimage || festival.firstimage2 || null,
        mapx: festival.mapx,
        mapy: festival.mapy,
        daysLeft: calculateDaysLeft(startDateRaw, endDateRaw, todayStr), // 남은 일수/시작까지 남은 일수
        category: festival.cat3 || festival.cat2 || '축제', // 카테고리
      };
    }).filter(f => f.status !== 'ended'); // 종료된 축제는 기본적으로 제외

    // 요청된 상태에 따라 필터링
    let filteredFestivals = processedFestivals;
    if (status === 'ongoing') {
      filteredFestivals = processedFestivals.filter(f => f.status === 'ongoing');
    } else if (status === 'upcoming') {
      filteredFestivals = processedFestivals.filter(f => f.status === 'upcoming');
    }

    // 각 상태별로 분류 및 정렬
    const ongoing = processedFestivals
      .filter(f => f.status === 'ongoing')
      .sort((a, b) => a.endDateRaw.localeCompare(b.endDateRaw)) // 종료일이 가까운 순
      .slice(0, 20); // 최대 20개

    const upcoming = processedFestivals
      .filter(f => f.status === 'upcoming')
      .sort((a, b) => a.startDateRaw.localeCompare(b.startDateRaw)) // 시작일이 가까운 순
      .slice(0, 20); // 최대 20개

    const thisWeekend = processedFestivals.filter(f => {
      // 이번 주말 포함 여부
      const startDate = new Date(f.startDateRaw.slice(0,4), f.startDateRaw.slice(4,6)-1, f.startDateRaw.slice(6,8));
      const endDate = new Date(f.endDateRaw.slice(0,4), f.endDateRaw.slice(4,6)-1, f.endDateRaw.slice(6,8));
      const thisSaturday = getThisSaturday();
      const thisSunday = getThisSunday();
      
      return (startDate <= thisSunday && endDate >= thisSaturday);
    }).slice(0, 10); // 최대 10개

    // 통계 계산
    const stats = {
      total: processedFestivals.length,
      ongoing: ongoing.length,
      upcoming: upcoming.length,
      thisWeekend: thisWeekend.length,
      regions: [...new Set(processedFestivals.map(f => f.region))].length, // 활성 지역 수
      popularRegions: getPopularRegions(processedFestivals) // 인기 지역 목록
    };

    // 최종 응답 반환
    return res.status(200).json({
      success: true,
      data: {
        ongoing,
        upcoming,
        thisWeekend,
        stats,
        message: '🎪 실시간 축제 정보',
        time: new Date().toLocaleString('ko-KR'), // 현재 시간 (한국어 포맷)
        lastUpdate: new Date().toISOString() // ISO 형식의 마지막 업데이트 시간
      },
      timestamp: new Date().toISOString() // 서버 응답 시간
    });

  } catch (error) {
    console.error('축제 정보 조회 중 서버리스 함수 오류:', error);
    // 오류 발생 시에도 샘플 데이터 반환
    return res.status(200).json({ // 500 대신 200으로 반환하여 클라이언트에서 에러를 처리하도록 함
      success: false, // API 자체는 동작했지만, 데이터 가져오기에 실패했음을 나타냄
      data: getSampleFestivalsWithStats('all', new Date().toISOString().slice(0,10).replace(/-/g, '')),
      message: `⚠️ 데이터 조회 오류: ${error.message || '알 수 없는 오류'}`,
      timestamp: new Date().toISOString()
    });
  }
};


// --- 헬퍼 함수들 (api/festivals.js 파일 내부에 함께 포함) ---

// 지역명 -> 지역 코드 매핑 (한국관광공사 API 기준)
function getAreaCode(regionName) {
  const codes = {
    '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
    '세종': 8, '경기': 31, '강원': 32, '충북': 33, '충남': 34, '전북': 37,
    '전남': 38, '경북': 35, '경남': 36, '제주': 39
  };
  return codes[regionName] || null; // 일치하는 지역명 없으면 null 반환
}

// 지역 코드 -> 지역명 매핑
function getRegionName(areacode) {
  const regions = {
    1: '서울', 6: '부산', 4: '대구', 2: '인천', 5: '광주', 3: '대전', 7: '울산',
    8: '세종', 31: '경기', 32: '강원', 33: '충북', 34: '충남', 37: '전북',
    38: '전남', 35: '경북', 36: '경남', 39: '제주'
  };
  return regions[areacode] || '기타';
}

// 날짜 포맷팅 (YYYY.MM.DD)
function formatDateDisplay(dateStr) {
  if (!dateStr || dateStr.length !== 8) return '날짜 미정';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}.${month}.${day}`;
}

// 날짜 포맷팅 (YYYYMMDD) - 내부 계산용
function formatDateRaw(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

// 남은 일수/시작까지 남은 일수 계산
function calculateDaysLeft(startDateRaw, endDateRaw, todayRaw) {
  const start = new Date(startDateRaw.slice(0,4), startDateRaw.slice(4,6)-1, startDateRaw.slice(6,8));
  const end = new Date(endDateRaw.slice(0,4), endDateRaw.slice(4,6)-1, endDateRaw.slice(6,8));
  const now = new Date(todayRaw.slice(0,4), todayRaw.slice(4,6)-1, todayRaw.slice(6,8));
  
  if (start <= now && end >= now) { // 진행중
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft === 0 ? '오늘 종료' : `${daysLeft}일 남음`;
  } else if (start > now) { // 예정
    const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `${daysUntil}일 후 시작`;
  }
  return '종료'; // 이미 종료됨
}

// 이번 주 토요일 날짜 객체 반환
function getThisSaturday() {
  const today = new Date();
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - today.getDay() + 7) % 7); // 다음 토요일 계산
  saturday.setHours(0,0,0,0);
  return saturday;
}

// 이번 주 일요일 날짜 객체 반환
function getThisSunday() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + (7 - today.getDay() + 7) % 7); // 다음 일요일 계산
  sunday.setHours(23,59,59,999);
  return sunday;
}

// 인기 지역 계산
function getPopularRegions(festivals) {
  const regionCount = {};
  festivals.forEach(f => {
    regionCount[f.region] = (regionCount[f.region] || 0) + 1;
  });
  
  return Object.entries(regionCount)
    .sort((a, b) => b[1] - a[1]) // 개수 내림차순 정렬
    .slice(0, 5) // 상위 5개
    .map(([region, count]) => ({ region, count }));
}

// --- 샘플 축제 데이터 및 통계 생성 함수 (API 키 없거나 오류 발생 시 사용) ---
function getSampleFestivals(type, todayStr) {
    const calculateSampleDaysLeft = (startDateStr, endDateStr, todayStr) => {
        const start = new Date(startDateStr.slice(0,4), startDateStr.slice(4,6)-1, startDateStr.slice(6,8));
        const end = new Date(endDateStr.slice(0,4), endDateStr.slice(4,6)-1, endDateStr.slice(6,8));
        const now = new Date(todayStr.slice(0,4), todayStr.slice(4,6)-1, todayStr.slice(6,8));
        
        if (start <= now && end >= now) {
            const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
            return daysLeft === 0 ? '오늘 종료' : `${daysLeft}일 남음`;
        } else if (start > now) {
            const daysUntil = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
            return `${daysUntil}일 후 시작`;
        }
        return '종료';
    };

    const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return '날짜 미정';
        const year = dateStr.slice(0, 4);
        const month = dateStr.slice(4, 6);
        const day = dateStr.slice(6, 8);
        return `${year}.${month}.${day}`;
    };

    const sampleData = [
        { id: '1', title: '서울 빛초롱 축제', location: '청계천 일대', region: '서울', startDateRaw: '20250501', endDateRaw: '20250615', category: '문화축제', image: 'https://placehold.co/100x100?text=Light' },
        { id: '2', title: '부산 바다축제', location: '해운대 해수욕장', region: '부산', startDateRaw: '20250520', endDateRaw: '20250605', category: '해양축제', image: 'https://placehold.co/100x100?text=Sea' },
        { id: '3', title: '제주 유채꽃 축제', location: '제주 서귀포시', region: '제주', startDateRaw: '20250525', endDateRaw: '20250610', category: '자연축제', image: 'https://placehold.co/100x100?text=Flower' },
        { id: '4', title: '전주 한옥마을 축제', location: '전주 한옥마을', region: '전주', startDateRaw: '20250610', endDateRaw: '20250620', category: '전통축제', image: 'https://placehold.co/100x100?text=Hanok' },
        { id: '5', title: '강릉 커피축제', location: '강릉 안목해변', region: '강릉', startDateRaw: '20250615', endDateRaw: '20250625', category: '음식축제', image: 'https://placehold.co/100x100?text=Coffee' },
        { id: '6', title: '서울 한강 축제', location: '한강공원', region: '서울', startDateRaw: '20250601', endDateRaw: '20250602', category: '야외축제', image: 'https://placehold.co/100x100?text=River' }
    ];

    const processedSamples = sampleData.map(f => {
        const status = (f.startDateRaw <= todayStr && f.endDateRaw >= todayStr) ? 'ongoing' : (f.startDateRaw > todayStr ? 'upcoming' : 'ended');
        return {
            ...f,
            status: status,
            startDate: formatDate(f.startDateRaw),
            endDate: formatDate(f.endDateRaw),
            daysLeft: calculateSampleDaysLeft(f.startDateRaw, f.endDateRaw, todayStr)
        };
    }).filter(f => f.status !== 'ended'); 

    const getSampleThisWeekend = (todayStr) => {
        const today = new Date(todayStr.slice(0,4), todayStr.slice(4,6)-1, todayStr.slice(6,8));
        const thisSaturday = new Date(today);
        thisSaturday.setDate(today.getDate() + (6 - today.getDay()));
        const thisSunday = new Date(today);
        thisSunday.setDate(today.getDate() + (7 - today.getDay()));

        return processedSamples.filter(f => {
            const startDate = new Date(f.startDateRaw.slice(0,4), f.startDateRaw.slice(4,6)-1, f.startDateRaw.slice(6,8));
            const endDate = new Date(f.endDateRaw.slice(0,4), f.endDateRaw.slice(4,6)-1, f.endDateRaw.slice(6,8));
            return (startDate <= thisSunday && endDate >= thisSaturday);
        });
    };

    const ongoing = processedSamples.filter(f => f.status === 'ongoing');
    const upcoming = processedSamples.filter(f => f.status === 'upcoming');
    const thisWeekend = getSampleThisWeekend(todayStr);

    if (type === 'ongoing') return ongoing;
    if (type === 'upcoming') return upcoming;
    if (type === 'weekend') return thisWeekend;
    return processedSamples;
}

// 목업 데이터와 통계를 포함하는 함수
function getSampleFestivalsWithStats(type, todayStr) {
    const allProcessed = getSampleFestivals('all', todayStr);
    const ongoing = allProcessed.filter(f => f.status === 'ongoing');
    const upcoming = allProcessed.filter(f => f.status === 'upcoming');
    const thisWeekend = getSampleFestivals('weekend', todayStr); 

    const regionCount = {};
    allProcessed.forEach(f => {
        regionCount[f.region] = (regionCount[f.region] || 0) + 1;
    });
    const popularRegions = Object.entries(regionCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({ region, count }));

    return {
        ongoing: ongoing.slice(0, 20),
        upcoming: upcoming.slice(0, 20),
        thisWeekend: thisWeekend.slice(0, 10),
        stats: {
            total: allProcessed.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            regions: [...new Set(allProcessed.map(f => f.region))].length,
            popularRegions: popularRegions
        },
        message: '⚠️ API 키 미설정 또는 네트워크 오류로 샘플 데이터를 표시합니다.',
        time: new Date().toLocaleString('ko-KR'),
        lastUpdate: new Date().toISOString()
    };
}
