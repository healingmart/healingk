// api/tourism.js (Node.js API Endpoint)

const axios = require('axios'); // 'axios' 라이브러리 설치 필요 (npm install axios)
const he = require('he');      // 'he' 라이브러리 설치 필요 (npm install he) - HTML 엔티티 디코딩용

// 환경 변수 로드 (서버리스 환경에서는 자동 로드되거나, 로컬에서 dotenv 필요)
// 로컬 테스트 시 'dotenv' 패키지가 설치되어 있어야 합니다 (npm install dotenv).
if (process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
    try {
        require('dotenv').config();
    } catch (e) {
        console.warn("dotenv 패키지를 찾을 수 없습니다. 'npm install dotenv'를 실행하거나, 환경 변수가 이미 설정되어 있는지 확인하세요.");
    }
}

// 한국관광공사 API 기본 URL (최신 KorService2)
const BASE_TOURISM_API_URL = 'http://apis.data.go.kr/B551011/KorService2';

// 지역 코드 매핑 (확장 가능)
const AREA_CODES = {
    '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
    '세종': 8, '경기': 31, '강원': 32, '충북': 33, '충남': 34, '경북': 35,
    '경남': 36, '전북': 37, '전남': 38, '제주': 39,
    // 특정 도시를 요청해도 해당 도의 areaCode로 매핑 (예: '강릉' -> '강원'의 32)
    '강릉': 32, '전주': 37, '경주': 35, '여수': 38, '제주시': 39, '서귀포시': 39
};

// 컨텐츠 타입 코드 (주요 항목)
const CONTENT_TYPE_CODES = {
    '관광지': 12,
    '문화시설': 14,
    '축제공연행사': 15,
    '여행코스': 25,
    '레포츠': 28,
    '숙박': 32,
    '쇼핑': 38,
    '음식점': 39
};

/**
 * 환경 변수에서 유효한 API 키를 찾아 반환합니다.
 * 전북 API에서 사용된 키 우선순위를 따릅니다.
 */
function getTourismApiKey() {
    const possibleKeys = [
        process.env.TOURISM_API_KEY, // 가장 권장
        process.env.JEONBUK_API_KEY, // 이전 코드와 호환성 유지
        process.env.TOUR_API_KEY,
        process.env.WEATHER_API_KEY, // 다른 API 키가 오용될 수도 있으므로 마지막에 배치
        process.env.REGIONAL_API_KEY
    ];
    return possibleKeys.find(key => key);
}

/**
 * 한국관광공사 API를 호출하는 공통 함수
 * @param {string} endpoint API 엔드포인트 (예: 'areaBasedList1', 'detailCommon1')
 * @param {Object} params 요청 파라미터
 * @returns {Promise<Object>} API 응답 데이터의 body 부분
 */
async function callTourismApi(endpoint, params = {}) {
    const apiKey = getTourismApiKey();
    if (!apiKey) {
        throw new Error('API 키가 설정되지 않았습니다. 환경 변수를 확인해주세요.');
    }

    const defaultParams = {
        serviceKey: apiKey,
        _type: 'json',
        MobileOS: 'ETC',
        MobileApp: 'HealingK', // 앱 이름은 자유롭게 설정 가능
        numOfRows: 10,
        pageNo: 1,
    };

    const mergedParams = { ...defaultParams, ...params };
    const queryString = new URLSearchParams(mergedParams).toString();
    const requestUrl = `${BASE_TOURISM_API_URL}/${endpoint}?${queryString}`;

    try {
        console.log(`[API Call] URL: ${requestUrl.split('serviceKey=')[0]}...`); // API 키는 로그에 노출하지 않음
        const response = await axios.get(requestUrl, { timeout: 15000 }); // 15초 타임아웃

        const data = response.data;
        const header = data.response?.header;

        if (header && header.resultCode !== '0000') {
            const errorMsg = he.decode(header.resultMsg || '알 수 없는 오류');
            throw new Error(`API 응답 오류: ${header.resultCode} - ${errorMsg}`);
        }

        const body = data.response?.body;
        // 단일 항목일 경우 객체로 반환될 수 있으므로 배열로 정규화
        if (body && body.items && body.items.item && !Array.isArray(body.items.item)) {
            body.items.item = [body.items.item];
        }

        return body;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`[Axios Error] API 호출 실패: ${error.message}`);
            if (error.response) {
                console.error(`[Axios Error] Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
            }
        } else {
            console.error(`[General Error] API 호출 중 예외 발생: ${error.message}`);
        }
        throw error;
    }
}

/**
 * 관광 데이터를 클라이언트 친화적인 형식으로 변환합니다.
 * @param {Array} items API 응답의 아이템 배열
 * @param {string} region 요청 지역 이름
 * @returns {Array} 변환된 관광 정보 배열
 */
function formatTourismItems(items, region) {
    if (!items || items.length === 0) {
        return [];
    }

    return items.map(item => ({
        id: item.contentid,
        contentTypeId: item.contenttypeid,
        title: he.decode(item.title || '제목 없음'),
        address: he.decode(item.addr1 || item.addr2 || `${region} 지역`),
        tel: item.tel || '정보 없음',
        imageUrl: item.firstimage || item.firstimage2 || null, // 고화질, 저화질 이미지
        mapX: item.mapx,
        mapY: item.mapy,
        overview: item.overview ? he.decode(item.overview) : null, // 상세 정보에서 개요
        // 기타 유용한 필드 추가 가능
        areaCode: item.areacode,
        sigunguCode: item.sigungucode,
        createdTime: item.createdtime,
        modifiedTime: item.modifiedtime,
        zipcode: item.zipcode,
        cat1: item.cat1, // 대분류
        cat2: item.cat2, // 중분류
        cat3: item.cat3, // 소분류
    }));
}

/**
 * API 엔드포인트 핸들러 함수
 * @param {Object} req 요청 객체
 * @param {Object} res 응답 객체
 */
module.exports = async function handler(req, res) {
    // CORS 헤더 설정 (모든 오리진 허용)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY'); // X-API-KEY 헤더 추가 가능

    // OPTIONS 요청 처리 (CORS 사전 검사)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET 요청 처리
    if (req.method === 'GET') {
        try {
            const {
                region = '서울',             // 기본 지역: 서울
                keyword,                   // 키워드 검색
                contentType = '관광지',    // 기본 컨텐츠 타입: 관광지 (12)
                pageNo = 1,
                numOfRows = 10,
                contentId,                 // 상세 정보 조회 시 contentId
                detailType,                // 상세 정보 타입 (common, intro, info, image)
                eventStartDate             // 행사 검색 시 시작일 (YYYYMMDD)
            } = req.query;

            console.log(`[Request] Region: ${region}, Keyword: ${keyword || 'N/A'}, ContentType: ${contentType}, DetailType: ${detailType || 'N/A'}, ContentId: ${contentId || 'N/A'}`);

            const areaCode = AREA_CODES[region] || 1; // 지역 코드 매핑 또는 기본값 1(서울)
            const contentTypeId = CONTENT_TYPE_CODES[contentType] || 12; // 컨텐츠 타입 매핑 또는 기본값 12(관광지)

            let resultData = [];
            let message = '';
            let apiMethod = '';

            // 1. 상세 정보 조회 (contentId가 있을 경우 최우선)
            if (contentId) {
                apiMethod = `detail_${detailType || 'common'}`;
                console.log(`[Action] 상세 정보 조회: contentId=${contentId}, detailType=${detailType}`);
                if (detailType === 'image') {
                    const response = await callTourismApi('detailImage1', { contentId, numOfRows: 50, imageYN: 'Y' });
                    resultData = formatTourismItems(response?.items?.item || [], region);
                    message = `🏛️ ${region} 콘텐츠 ID ${contentId}의 상세 이미지 정보`;
                } else { // common, intro, info 등
                    const response = await callTourismApi('detailCommon1', {
                        contentId,
                        contentTypeId, // 상세 조회 시 contentTypeId도 필요할 수 있음
                        defaultYN: 'Y', overviewYN: 'Y', firstImageYN: 'Y',
                        // introYN: 'Y', B551011/KorService2/detailIntro1 필요 (별도 API)
                        // infoYN: 'Y', B551011/KorService2/detailInfo1 필요 (별도 API)
                    });
                    if (response && response.items && response.items.item && response.items.item.length > 0) {
                        resultData = formatTourismItems(response.items.item, region);
                    }
                    message = `🏛️ ${region} 콘텐츠 ID ${contentId}의 상세 정보`;
                }

            }
            // 2. 키워드 검색
            else if (keyword) {
                apiMethod = 'searchKeyword';
                console.log(`[Action] 키워드 검색: keyword=${keyword}, contentTypeId=${contentTypeId}`);
                const response = await callTourismApi('searchKeyword1', {
                    keyword: encodeURIComponent(keyword), // URL 인코딩 필수
                    areaCode,
                    contentTypeId,
                    pageNo,
                    numOfRows
                });
                resultData = formatTourismItems(response?.items?.item || [], region);
                message = `🔍 '${keyword}'에 대한 ${region} 관광 정보`;
            }
            // 3. 행사/축제 검색
            else if (eventStartDate) {
                apiMethod = 'searchFestival';
                console.log(`[Action] 행사/축제 검색: eventStartDate=${eventStartDate}`);
                const response = await callTourismApi('searchFestival1', {
                    eventStartDate,
                    areaCode,
                    pageNo,
                    numOfRows,
                    contentTypeId: CONTENT_TYPE_CODES['축제공연행사'] // 행사 고정
                });
                resultData = formatTourismItems(response?.items?.item || [], region);
                message = `📅 ${eventStartDate}부터 시작하는 ${region}의 행사/축제`;
            }
            // 4. 지역 기반 목록 조회 (기본 동작)
            else {
                apiMethod = 'searchArea';
                console.log(`[Action] 지역 기반 검색: areaCode=${areaCode}, contentTypeId=${contentTypeId}`);
                const response = await callTourismApi('searchArea1', {
                    areaCode,
                    contentTypeId,
                    pageNo,
                    numOfRows,
                    listYN: 'Y', // 목록 형태 응답 요청
                    arrange: 'A' // 제목순 정렬
                });
                resultData = formatTourismItems(response?.items?.item || [], region);
                message = `🏛️ ${region}의 ${contentType} 정보`;
            }

            // 응답 데이터 구성
            const responsePayload = {
                success: true,
                region: region,
                contentType: contentType,
                data: resultData,
                count: resultData.length,
                message: message,
                apiMethod: apiMethod,
                timestamp: new Date().toISOString()
            };

            console.log(`[Success] 응답 데이터 전송: ${responsePayload.count}개 아이템`);
            return res.status(200).json(responsePayload);

        } catch (error) {
            console.error('❌ API 핸들러 오류:', error.message);
            const errorMessage = error.message.includes('API 응답 오류:') ? error.message : `API 호출 중 오류 발생: ${error.message}`;

            // 오류 발생 시 샘플 데이터 제공 (폴백)
            return res.status(200).json({
                success: false, // 실제 API 호출 실패 시 success: false
                region: req.query.region || '서울',
                data: getTourismSampleData(req.query.region || '서울'), // 백업 샘플 데이터
                message: `⚠️ 실시간 정보 조회 실패: ${errorMessage}. 백업 샘플 데이터 제공.`,
                timestamp: new Date().toISOString(),
                errorDetail: error.message
            });
        }
    } else {
        // GET, OPTIONS 외의 메서드 처리
        res.setHeader('Allow', ['GET', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};

// --- 샘플 데이터 (API 호출 실패 시 사용) ---
function getTourismSampleData(region) {
    const defaultAttractions = [
        { id: 'sample_001', title: `${region} 샘플 관광지 1`, category: '문화관광지', address: `${region} 어딘가`, imageUrl: 'https://picsum.photos/300/200?random=1', overview: '이곳은 샘플 데이터입니다. 실제 API 응답이 아닙니다.' },
        { id: 'sample_002', title: `${region} 샘플 자연 공원`, category: '자연관광지', address: `${region} 자연 어딘가`, imageUrl: 'https://picsum.photos/300/200?random=2', overview: '이곳은 샘플 데이터입니다. 실제 API 응답이 아닙니다.' },
        { id: 'sample_003', title: `${region} 샘플 박물관`, category: '문화시설', address: `${region} 시내`, imageUrl: 'https://picsum.photos/300/200?random=3', overview: '이곳은 샘플 데이터입니다. 실제 API 응답이 아닙니다.' }
    ];

    const defaultEvents = [
        { id: 'event_001', title: `${region} 봄꽃 축제 (샘플)`, location: `${region} 공원`, date: '2025-04-10 ~ 2025-04-20', imageUrl: 'https://picsum.photos/300/200?random=4', overview: '이곳은 샘플 데이터입니다. 실제 API 응답이 아닙니다.' },
        { id: 'event_002', title: `${region} 여름 음악회 (샘플)`, location: `${region} 야외 무대`, date: '2025-07-01 ~ 2025-07-05', imageUrl: 'https://picsum.photos/300/200?random=5', overview: '이곳은 샘플 데이터입니다. 실제 API 응답이 아닙니다.' }
    ];

    return {
        attractions: defaultAttractions,
        events: defaultEvents,
        message: `API 호출 실패로 인해 ${region}에 대한 샘플 데이터가 제공됩니다.`,
    };
}
