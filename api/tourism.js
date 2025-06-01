// api/tourism.js (Node.js API Endpoint for Vercel/Serverless)

const axios = require('axios'); // API 요청을 위한 HTTP 클라이언트
const he = require('he');      // HTML 엔티티를 디코딩하기 위한 라이브러리

// 로컬 개발 환경에서 .env 파일 로드를 위해 dotenv를 사용합니다.
// Vercel과 같은 배포 환경에서는 환경 변수가 자동으로 주입되므로 필요하지 않습니다.
if (process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
    try {
        require('dotenv').config();
    } catch (e) {
        console.warn("로컬에서 'dotenv' 패키지를 찾을 수 없습니다. 'npm install dotenv'를 실행하거나, 환경 변수가 이미 설정되어 있는지 확인하세요.");
    }
}

// 한국관광공사 API 기본 URL (최신 KorService2)
// KorService1은 현재 대부분의 요청에서 작동하지 않습니다.
const BASE_TOURISM_API_URL = 'http://apis.data.go.kr/B551011/KorService2';

// 주요 지역 코드 매핑
const AREA_CODES = {
    '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
    '세종': 8, '경기': 31, '강원': 32, '충북': 33, '충남': 34, '경북': 35,
    '경남': 36, '전북': 37, '전남': 38, '제주': 39,
    // 특정 도시를 입력해도 해당 도의 코드로 매핑하여 유연성을 높입니다.
    '강릉': 32, '전주': 37, '경주': 35, '여수': 38, '제주시': 39, '서귀포시': 39
};

// 주요 콘텐츠 타입 코드 매핑
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
 * 정의된 환경 변수들 중에서 유효한 한국관광공사 API 키를 찾아 반환합니다.
 * 보안 강화를 위해 여러 키를 순차적으로 시도합니다.
 * @returns {string|undefined} 유효한 API 키 또는 undefined
 */
function getTourismApiKey() {
    const possibleKeys = [
        process.env.TOURISM_API_KEY,    // 가장 권장되는 키 (명확성)
        process.env.JEONBUK_API_KEY,    // 기존 전북 API에서 성공한 키
        process.env.TOUR_API_KEY,
        process.env.REGIONAL_API_KEY,
        process.env.WEATHER_API_KEY     // 다른 API 키를 사용했을 가능성 대비
    ];
    // console.log('환경변수 체크:', {
    //     TOURISM_API_KEY: !!process.env.TOURISM_API_KEY,
    //     JEONBUK_API_KEY: !!process.env.JEONBUK_API_KEY,
    //     TOUR_API_KEY: !!process.env.TOUR_API_KEY,
    //     REGIONAL_API_KEY: !!process.env.REGIONAL_API_KEY,
    //     WEATHER_API_KEY: !!process.env.WEATHER_API_KEY
    // });
    return possibleKeys.find(key => key);
}

/**
 * 한국관광공사 API를 호출하는 공통 함수.
 * 응답의 성공/실패 여부를 판단하고 데이터 형식을 정규화합니다.
 * @param {string} endpoint API 엔드포인트 경로 (예: 'areaBasedList1', 'detailCommon1')
 * @param {Object} params API 요청에 필요한 파라미터 객체
 * @returns {Promise<Object>} API 응답의 'body' 부분 (데이터 목록 또는 단일 항목)
 * @throws {Error} API 키 누락, 네트워크 오류, 또는 API 응답 오류 시 발생
 */
async function callTourismApi(endpoint, params = {}) {
    const apiKey = getTourismApiKey();
    if (!apiKey) {
        throw new Error('TOURISM_API_KEY 환경 변수가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요.');
    }

    const defaultParams = {
        serviceKey: apiKey,
        _type: 'json',    // 응답 형식을 JSON으로 고정
        MobileOS: 'ETC',  // 모바일 OS 구분 (웹 환경이므로 ETC)
        MobileApp: 'HealingK', // 서비스 앱 이름 (배포하는 앱 이름으로 변경 가능)
        numOfRows: 10,    // 기본 조회 개수
        pageNo: 1,        // 기본 페이지 번호
    };

    const mergedParams = { ...defaultParams, ...params };
    const queryString = new URLSearchParams(mergedParams).toString();
    const requestUrl = `${BASE_TOURISM_API_URL}/${endpoint}?${queryString}`;

    try {
        // API 키가 노출되지 않도록 URL의 일부만 로깅
        console.log(`[API Call] Requesting: ${requestUrl.split('serviceKey=')[0]}...`);

        const response = await axios.get(requestUrl, { timeout: 15000 }); // 15초 타임아웃 설정
        const data = response.data;
        const header = data.response?.header;

        // 한국관광공사 API의 응답 코드 확인
        if (header && header.resultCode !== '0000') {
            const errorMsg = he.decode(header.resultMsg || '알 수 없는 API 응답 오류');
            throw new Error(`API 응답 오류 (${header.resultCode}): ${errorMsg}`);
        }

        const body = data.response?.body;

        // 응답 아이템이 단일 객체로 올 경우 배열로 정규화하여 일관된 처리 가능
        if (body && body.items && body.items.item && !Array.isArray(body.items.item)) {
            body.items.item = [body.items.item];
        }

        return body;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            // Axios에서 발생한 네트워크 또는 HTTP 오류 처리
            console.error(`[Axios Error] API 호출 실패: ${error.message}`);
            if (error.response) {
                console.error(`[Axios Error] Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data).substring(0, 500)}`);
            }
        } else {
            // 그 외 알 수 없는 오류
            console.error(`[General Error] API 호출 중 예외 발생: ${error.message}`);
        }
        throw error; // 오류를 다시 던져서 핸들러에서 최종 처리
    }
}

/**
 * 한국관광공사 API 응답 데이터를 클라이언트 친화적인 형식으로 변환합니다.
 * @param {Array|Object} items API 응답의 'item' 배열 또는 단일 객체
 * @param {string} region 요청 지역 이름 (데이터에 없을 경우 사용)
 * @returns {Array} 변환된 관광 정보 객체 배열
 */
function formatTourismItems(items, region) {
    // items가 null, undefined, 비어있는 경우 빈 배열 반환
    if (!items || (Array.isArray(items) && items.length === 0)) {
        return [];
    }

    // items가 단일 객체일 경우 배열로 변환하여 map 함수 적용
    const itemsArray = Array.isArray(items) ? items : [items];

    return itemsArray.map(item => ({
        id: item.contentid || null,             // 콘텐츠 고유 ID
        contentTypeId: item.contenttypeid || null, // 콘텐츠 타입 ID
        title: item.title ? he.decode(item.title) : '제목 없음', // HTML 엔티티 디코딩
        address: item.addr1 ? he.decode(item.addr1 + (item.addr2 ? ` ${item.addr2}` : '')) : `${region} 지역 (주소 정보 없음)`,
        tel: item.tel || '정보 없음',
        imageUrl: item.firstimage || item.firstimage2 || null, // 고화질 또는 저화질 이미지
        mapX: item.mapx || null,                // 경도 (longitude)
        mapY: item.mapy || null,                // 위도 (latitude)
        overview: item.overview ? he.decode(item.overview) : null, // 상세 개요 (common에서만 제공)
        // 상세 이미지 정보 (detailImage에서 사용)
        smallImageUrl: item.smallimageurl || null,
        originImageUrl: item.originimgurl || null,
        serialNum: item.serialnum || null,
        // 기타 유용한 필드 (필요에 따라 추가)
        areaCode: item.areacode || null,
        sigunguCode: item.sigungucode || null,
        createdTime: item.createdtime || null,
        modifiedTime: item.modifiedtime || null,
        zipcode: item.zipcode || null,
        cat1: item.cat1 || null, // 대분류 코드
        cat2: item.cat2 || null, // 중분류 코드
        cat3: item.cat3 || null, // 소분류 코드
        // event 관련 필드 (축제/행사 검색 시)
        eventStartDate: item.eventstartdate || null,
        eventEndDate: item.eventenddate || null,
        place: item.eventplace || null,
        tel: item.tel || null,
        homepage: item.homepage || null,
    }));
}

/**
 * API 호출 실패 시 제공할 샘플 데이터.
 * 실제 데이터가 없을 때 사용자에게 최소한의 정보를 제공합니다.
 * @param {string} region 현재 요청된 지역 이름
 * @returns {Object} 샘플 데이터 객체
 */
function getTourismSampleData(region) {
    const attractions = [
        { id: 'sample_001', title: `${region} 샘플 관광지 1`, category: '문화관광지', address: `${region} 샘플 주소`, imageUrl: 'https://picsum.photos/300/200?random=1', overview: '이곳은 실시간 데이터가 아닌 샘플 정보입니다.' },
        { id: 'sample_002', title: `${region} 샘플 자연 공원`, category: '자연관광지', address: `${region} 자연 공원`, imageUrl: 'https://picsum.photos/300/200?random=2', overview: 'API 호출 실패 시 백업으로 제공되는 정보입니다.' },
        { id: 'sample_003', title: `${region} 샘플 박물관`, category: '문화시설', address: `${region} 문화 시설`, imageUrl: 'https://picsum.photos/300/200?random=3', overview: '정확한 정보를 원하시면 나중에 다시 시도해 주세요.' }
    ];

    const events = [
        { id: 'event_001', title: `${region} 샘플 봄꽃 축제`, location: `${region} 공원`, date: '2025-04-10 ~ 2025-04-20', imageUrl: 'https://picsum.photos/300/200?random=4', overview: '이것은 샘플 이벤트 데이터입니다.' },
        { id: 'event_002', title: `${region} 샘플 여름 음악회`, location: `${region} 야외 무대`, date: '2025-07-01 ~ 2025-07-05', imageUrl: 'https://picsum.photos/300/200?random=5', overview: 'API 호출이 정상화되면 실제 데이터가 표시됩니다.' }
    ];

    return {
        attractions: attractions,
        events: events,
        message: `API 호출 실패로 인해 ${region}에 대한 샘플 데이터가 제공됩니다.`,
    };
}

/**
 * 메인 API 엔드포인트 핸들러 함수.
 * HTTP 요청을 처리하고 한국관광공사 API를 호출하여 응답을 반환합니다.
 * @param {Object} req HTTP 요청 객체 (Express.js 또는 Vercel/Netlify Functions 형식)
 * @param {Object} res HTTP 응답 객체 (Express.js 또는 Vercel/Netlify Functions 형식)
 */
module.exports = async function handler(req, res) {
    // CORS 헤더 설정: 모든 도메인에서의 접근을 허용합니다.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY'); // 추가 헤더 허용 가능

    // OPTIONS 요청 (CORS 사전 검사) 처리: 200 OK로 바로 응답합니다.
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET 요청 처리
    if (req.method === 'GET') {
        try {
            // 쿼리 파라미터 추출 및 기본값 설정
            const {
                region = '서울',                // 기본 검색 지역: 서울
                keyword,                      // 키워드 검색 (예: '경복궁')
                contentType = '관광지',       // 기본 콘텐츠 타입: 관광지 (12)
                pageNo = 1,                   // 기본 페이지 번호
                numOfRows = 10,               // 기본 조회 개수
                contentId,                    // 특정 콘텐츠 ID (상세 정보 조회용)
                detailType = 'common',        // 상세 정보 타입: common, image (향후 intro, info 추가 가능)
                eventStartDate                // 행사/축제 시작일 (YYYYMMDD 형식)
            } = req.query;

            console.log(`[Request Received] Region: ${region}, Keyword: ${keyword || 'N/A'}, ContentType: ${contentType}, ContentId: ${contentId || 'N/A'}, DetailType: ${detailType}`);

            // 지역 코드와 콘텐츠 타입 ID 매핑
            const areaCode = AREA_CODES[region] || 1; // 기본값: 서울
            const contentTypeId = CONTENT_TYPE_CODES[contentType] || 12; // 기본값: 관광지

            let resultData = [];
            let message = '';
            let apiEndpointUsed = ''; // 어떤 API 엔드포인트를 사용했는지 기록

            // 1. contentId가 있을 경우 상세 정보 조회 (최우선 순위)
            if (contentId) {
                console.log(`[Action] Fetching detail info for Content ID: ${contentId}, Type: ${detailType}`);
                if (detailType === 'image') {
                    // 상세 이미지 정보 조회
                    apiEndpointUsed = 'detailImage1';
                    const response = await callTourismApi(apiEndpointUsed, {
                        contentId,
                        numOfRows: 50, // 이미지 개수는 넉넉하게 요청
                        imageYN: 'Y'
                    });
                    resultData = formatTourismItems(response?.items?.item || [], region);
                    message = `🏛️ ${region} 콘텐츠 ID ${contentId}의 상세 이미지 정보`;
                } else { // 'common' 또는 기본값
                    // 상세 공통 정보 조회 (개요, 주소, 이미지 등)
                    apiEndpointUsed = 'detailCommon1';
                    const response = await callTourismApi(apiEndpointUsed, {
                        contentId,
                        contentTypeId, // 상세 조회 시에도 콘텐츠 타입 ID 필요할 수 있음
                        defaultYN: 'Y',   // 기본 정보
                        overviewYN: 'Y',  // 개요 정보
                        firstImageYN: 'Y' // 대표 이미지 정보
                    });
                    if (response && response.items && response.items.item) {
                        resultData = formatTourismItems(response.items.item, region);
                    }
                    message = `🏛️ ${region} 콘텐츠 ID ${contentId}의 상세 정보`;
                }
            }
            // 2. keyword가 있을 경우 키워드 검색
            else if (keyword) {
                console.log(`[Action] Searching by keyword: "${keyword}" in ${region}`);
                apiEndpointUsed = 'searchKeyword1';
                const response = await callTourismApi(apiEndpointUsed, {
                    keyword: encodeURIComponent(keyword), // 키워드는 URL 인코딩 필수
                    areaCode,
                    contentTypeId,
                    pageNo,
                    numOfRows
                });
                resultData = formatTourismItems(response?.items?.item || [], region);
                message = `🔍 '${keyword}'에 대한 ${region} 관광 정보`;
            }
            // 3. eventStartDate가 있을 경우 행사/축제 검색
            else if (eventStartDate) {
                console.log(`[Action] Searching festivals starting from: ${eventStartDate} in ${region}`);
                apiEndpointUsed = 'searchFestival1';
                const response = await callTourismApi(apiEndpointUsed, {
                    eventStartDate,
                    areaCode,
                    pageNo,
                    numOfRows,
                    contentTypeId: CONTENT_TYPE_CODES['축제공연행사'] // 축제/행사는 고정된 콘텐츠 타입 사용
                });
                resultData = formatTourismItems(response?.items?.item || [], region);
                message = `📅 ${eventStartDate}부터 시작하는 ${region}의 행사/축제 정보`;
            }
            // 4. 기본: 지역 기반 목록 검색
            else {
                console.log(`[Action] Fetching area-based list for ${region}, ContentType: ${contentType}`);
                apiEndpointUsed = 'searchArea1';
                const response = await callTourismApi(apiEndpointUsed, {
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

            // 최종 응답 데이터 구성
            const responsePayload = {
                success: true,
                region: region,
                contentType: contentType,
                data: resultData,
                count: resultData.length,
                message: message,
                apiEndpointUsed: apiEndpointUsed, // 어떤 API 엔드포인트가 사용되었는지 정보 제공
                timestamp: new Date().toISOString(),
                // 디버깅 및 정보 제공용
                query: req.query
            };

            console.log(`[Response Success] Sending ${responsePayload.count} items. Endpoint: ${apiEndpointUsed}`);
            return res.status(200).json(responsePayload);

        } catch (error) {
            // API 호출 또는 처리 중 오류 발생 시
            console.error('❌ API 핸들러 오류 발생:', error.message);
            const errorMessage = error.message.includes('API 응답 오류:') ? error.message : `API 호출 중 알 수 없는 오류 발생: ${error.message}`;

            // 오류 발생 시에도 서비스 중단을 막기 위해 샘플 데이터를 제공합니다.
            return res.status(200).json({
                success: false, // 실제 API 호출 실패를 명시
                region: req.query.region || '서울',
                data: getTourismSampleData(req.query.region || '서울'), // 백업 샘플 데이터 제공
                message: `⚠️ 실시간 관광 정보 조회 실패: ${errorMessage}. 백업 샘플 데이터가 제공됩니다.`,
                timestamp: new Date().toISOString(),
                errorDetail: error.message // 상세 오류 메시지 포함
            });
        }
    } else {
        // GET, OPTIONS 외의 HTTP 메서드에 대한 응답 (405 Method Not Allowed)
        res.setHeader('Allow', ['GET', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
