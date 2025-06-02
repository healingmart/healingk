// api/alltourism.js

// ===== 지역 코드 및 설정 =====
const AREA_CODES = {
  // 특별시/광역시
  '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
  '세종': 8, '세종시': 8,
  
  // 도 지역
  '경기': 31, '강원': 32, '충북': 33, '충남': 34, '전북': 37, '전남': 38, 
  '경북': 35, '경남': 36, '제주': 39,
  
  // 주요 관광 도시
  '강릉': 32, '춘천': 32, '속초': 32, '평창': 32,
  '천안': 34, '공주': 34, '부여': 34,
  '전주': 37, '군산': 37, '정읍': 37, '남원': 37,
  '목포': 38, '순천': 38, '여수': 38,
  '경주': 35, '안동': 35, '포항': 35,
  '통영': 36, '거제': 36, '남해': 36,
  '제주시': 39, '서귀포': 39,
  
  // 경기도 주요 도시
  '수원': 31, '성남': 31, '안양': 31, '부천': 31, '광명': 31, '평택': 31,
  '동탄': 31, '일산': 31, '분당': 31, '판교': 31
};

const CONTENT_TYPES = {
    festivals: 15,
    accommodation: 32,
    restaurants: 39,
    culture: 14,
    attractions: 12,
    shopping: 38,
    sports: 28,
    course: 25,
    all: 'all'
};

const API_ENDPOINTS = {
  service1: {
    areaList: 'https://apis.data.go.kr/B551011/KorService1/areaBasedList1',
    keyword: 'https://apis.data.go.kr/B551011/KorService1/searchKeyword1',
    location: 'https://apis.data.go.kr/B551011/KorService1/locationBasedList1',
    festival: 'https://apis.data.go.kr/B551011/KorService1/searchFestival1'
  },
  service2: {
    areaList: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    keyword: 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2',
    location: 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2'
  }
};

// ===== 메인 핸들러 =====
module.exports = async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const startTime = Date.now();
        const { 
            region = '서울', 
            category = 'festivals',
            numOfRows = 10,
            pageNo = 1 
        } = req.query;
        
        console.log('🚀 ===== REAL-TIME 관광 API 시작 =====');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);
        console.log('🏷️ 카테고리:', category);
        console.log('📊 요청 개수:', numOfRows);

        // API 키 확인
        const apiKeyResult = getAPIKey();
        if (!apiKeyResult.success) {
            return res.status(200).json({
                success: false,
                message: '⚠️ API 키 설정 필요 - 환경변수를 확인하세요',
                debug: 'No valid API key found',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });
        }

        console.log('✅ API 키 확인:', `${apiKeyResult.key.substring(0, 10)}... (${apiKeyResult.source})`);

        // 실시간 관광 API 처리 - 다중 전략
        console.log('🎯 실시간 관광 API 처리 시작...');
        const tourismResult = await processTourismAPIWithMultipleStrategies(apiKeyResult.key, region, category, {
            numOfRows: parseInt(numOfRows),
            pageNo: parseInt(pageNo)
        });

        const responseTime = Date.now() - startTime;

        if (tourismResult.success && tourismResult.data.length > 0) {
            console.log('🎉 실시간 API 성공!', `${tourismResult.data.length}개 데이터 수집`);
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} ${category} 실시간 관광 정보!`,
                method: tourismResult.method,
                realTime: true,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString(),
                debug: tourismResult.debug
            });
        }

        // 모든 전략 실패
        console.log('❌ 모든 실시간 API 전략 실패');
        return res.status(200).json({
            success: false,
            data: [],
            message: `❌ ${region} ${category} 실시간 데이터 수집 실패`,
            realTime: false,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
            debug: tourismResult.debug || '모든 API 전략 실패',
            apiAttempts: tourismResult.attempts || []
        });

    } catch (error) {
        console.error('❌ 메인 핸들러 오류:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: '🏛️ 관광 정보 서비스 일시 중단',
            timestamp: new Date().toISOString()
        });
    }
};

// ===== API 키 관리 =====
function getAPIKey() {
    const possibleKeys = [
        { name: 'TOURISM_API_KEY', key: process.env.TOURISM_API_KEY },
        { name: 'TOUR_API_KEY', key: process.env.TOUR_API_KEY },
        { name: 'JEONBUK_API_KEY', key: process.env.JEONBUK_API_KEY },
        { name: 'WEATHER_API_KEY', key: process.env.WEATHER_API_KEY },
        { name: 'REGIONAL_API_KEY', key: process.env.REGIONAL_API_KEY }
    ];

    console.log('🔑 환경변수 상태:');
    possibleKeys.forEach(item => {
        console.log(`  ${item.name}: ${item.key ? '✅ 설정됨' : '❌ 없음'}`);
    });

    const validKey = possibleKeys.find(item => item.key && item.key.length > 10);
    
    if (validKey) {
        console.log(`✅ 사용할 키: ${validKey.name}`);
        return { success: true, key: validKey.key, source: validKey.name };
    }

    console.log('❌ 유효한 API 키 없음');
    return { success: false };
}

// ===== 다중 전략 관광 API 처리 =====
async function processTourismAPIWithMultipleStrategies(apiKey, region, category, options) {
    const areaCode = AREA_CODES[region] || AREA_CODES['서울'];
    const contentTypeId = CONTENT_TYPES[category] || 12;
    
    console.log('📋 API 파라미터 설정:', {
        지역: `${region} (코드: ${areaCode})`,
        카테고리: `${category} (타입ID: ${contentTypeId})`,
        개수: options.numOfRows,
        페이지: options.pageNo
    });

    // 다양한 API 전략들 (순서대로 시도)
    const strategies = [
        // 전략 1: Service2 지역 기반 (가장 신뢰성 높음)
        {
            name: 'service2_area_based',
            url: API_ENDPOINTS.service2.areaList,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                contentTypeId: contentTypeId,
                areaCode: areaCode,
                arrange: 'D',
                listYN: 'Y',
                mapinfoYN: 'Y',
                imageYN: 'Y'
            }
        },
        // 전략 2: Service2 키워드 기반
        {
            name: 'service2_keyword_search',
            url: API_ENDPOINTS.service2.keyword,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                keyword: region,
                contentTypeId: contentTypeId,
                arrange: 'D',
                mapinfoYN: 'Y',
                imageYN: 'Y'
            }
        },
        // 전략 3: Service1 지역 기반 (백업)
        {
            name: 'service1_area_based',
            url: API_ENDPOINTS.service1.areaList,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                contentTypeId: contentTypeId,
                areaCode: areaCode
            }
        },
        // 전략 4: Service1 키워드 기반
        {
            name: 'service1_keyword_search',
            url: API_ENDPOINTS.service1.keyword,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                keyword: region,
                contentTypeId: contentTypeId
            }
        },
        // 전략 5: 축제 전용 API (category가 festivals인 경우)
        ...(category === 'festivals' ? [{
            name: 'service1_festival_specific',
            url: API_ENDPOINTS.service1.festival,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                areaCode: areaCode,
                eventStartDate: getCurrentDate(), // 오늘부터
                eventEndDate: getFutureDate(365)  // 1년 후까지
            }
        }] : [])
    ];

    const attempts = [];
    
    // 각 전략 순차 시도
    for (const strategy of strategies) {
        console.log(`🎯 전략 시도: ${strategy.name}`);
        
        const attempt = {
            strategy: strategy.name,
            timestamp: new Date().toISOString()
        };
        
        const result = await tryAPIStrategy(strategy, region, category);
        attempt.result = result.success ? 'success' : 'failed';
        attempt.error = result.error;
        attempt.dataCount = result.data ? result.data.length : 0;
        
        attempts.push(attempt);
        
        if (result.success && result.data && result.data.length > 0) {
            console.log(`✅ ${strategy.name} 성공! 데이터 ${result.data.length}개 수집`);
            return {
                success: true,
                method: strategy.name,
                data: result.data,
                attempts: attempts,
                debug: `성공: ${strategy.name}`
            };
        }
        
        console.log(`❌ ${strategy.name} 실패: ${result.error}`);
        
        // 전략 간 딜레이 (API 부하 방지)
        if (strategies.indexOf(strategy) < strategies.length - 1) {
            await sleep(800);
        }
    }

    return { 
        success: false, 
        data: [],
        method: 'all_strategies_failed',
        attempts: attempts,
        debug: '모든 API 전략 실패'
    };
}

// ===== API 전략 실행 =====
async function tryAPIStrategy(strategy, region, category) {
    try {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(strategy.params)) {
            params.append(key, value.toString());
        }
        
        const fullUrl = `${strategy.url}?${params.toString()}`;
        
        console.log(`📡 요청 전송:`);
        console.log(`  URL: ${strategy.url}`);
        console.log(`  파라미터:`, strategy.params);
        console.log(`  전체 URL: ${fullUrl.substring(0, 150)}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20초 타임아웃

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, application/xml, text/xml, */*',
                'User-Agent': 'HealingK-Tourism/2.0',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log(`📊 응답 수신:`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            return await handleJSONResponse(response, strategy.name, region, category);
        } else {
            return await handleXMLResponse(response, strategy.name, region, category);
        }

    } catch (error) {
        console.log(`❌ ${strategy.name} 실행 오류:`, error.message);
        return { success: false, error: error.message, data: [] };
    }
}

// ===== JSON 응답 처리 (상세 디버깅) =====
async function handleJSONResponse(response, strategyName, region, category) {
    try {
        const data = await response.json();
        
        console.log(`📦 JSON 응답 분석 (${strategyName}):`);
        console.log(`  response 존재: ${!!data.response}`);
        console.log(`  header 존재: ${!!data.response?.header}`);
        console.log(`  body 존재: ${!!data.response?.body}`);
        console.log(`  items 존재: ${!!data.response?.body?.items}`);
        
        // 결과 코드 확인
        const resultCode = data.response?.header?.resultCode;
        const resultMsg = data.response?.header?.resultMsg;
        
        console.log(`  결과 코드: ${resultCode}`);
        console.log(`  결과 메시지: ${resultMsg}`);
        
        // 전체 응답 구조 로깅 (처음 500자만)
        console.log(`  전체 응답:`, JSON.stringify(data, null, 2).substring(0, 500) + '...');
        
        if (resultCode === '0000' || resultCode === '00') {
            // 데이터 추출
            const items = data.response?.body?.items?.item;
            
            console.log(`  items 타입: ${typeof items}`);
            console.log(`  items 배열여부: ${Array.isArray(items)}`);
            console.log(`  items 길이: ${Array.isArray(items) ? items.length : (items ? 1 : 0)}`);
            
            if (items) {
                const itemsArray = Array.isArray(items) ? items : [items];
                
                if (itemsArray.length > 0) {
                    console.log(`🎉 원본 데이터 발견: ${itemsArray.length}개`);
                    console.log(`  첫 번째 아이템:`, JSON.stringify(itemsArray[0], null, 2).substring(0, 300) + '...');
                    
                    const transformedData = convertToTourismFormat(itemsArray, region, category);
                    console.log(`✅ 변환된 데이터: ${transformedData.length}개`);
                    
                    return {
                        success: true,
                        method: strategyName,
                        data: transformedData
                    };
                } else {
                    console.log(`⚠️ items 배열이 비어있음`);
                }
            } else {
                console.log(`⚠️ items가 null 또는 undefined`);
            }
        } else {
            console.log(`❌ API 오류 - 코드: ${resultCode}, 메시지: ${resultMsg}`);
        }
        
        return { success: false, error: `API 오류: ${resultMsg || '데이터 없음'}`, data: [] };
        
    } catch (error) {
        console.log(`❌ JSON 파싱 오류 (${strategyName}):`, error.message);
        return { success: false, error: 'JSON 파싱 실패', data: [] };
    }
}

// ===== XML 응답 처리 (상세 디버깅) =====
async function handleXMLResponse(response, strategyName, region, category) {
    try {
        const text = await response.text();
        
        console.log(`📄 XML 응답 분석 (${strategyName}):`);
        console.log(`  응답 길이: ${text.length}자`);
        console.log(`  응답 시작: ${text.substring(0, 200)}...`);
        
        // 성공 코드 확인
        const hasSuccessCode = text.includes('<resultCode>00</resultCode>') || 
                              text.includes('<resultCode>0000</resultCode>');
        
        console.log(`  성공 코드 존재: ${hasSuccessCode}`);
        
        if (hasSuccessCode) {
            console.log(`✅ XML 성공 코드 발견`);
            
            // 정교한 데이터 추출
            const extractXMLData = (pattern, flags = 'g') => {
                const matches = text.match(new RegExp(pattern, flags));
                if (!matches) return [];
                
                return matches.map(match => {
                    const cdataMatch = match.match(/<!\[CDATA\[(.*?)\]\]>/);
                    if (cdataMatch) return cdataMatch[1];
                    
                    const simpleMatch = match.match(/>([^<]+)</);
                    return simpleMatch ? simpleMatch[1] : '';
                });
            };

            const titles = extractXMLData('<title>(?:<\\!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</title>');
            const addresses = extractXMLData('<addr1>(?:<\\!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</addr1>');
            const images = extractXMLData('<firstimage>(?:<\\!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</firstimage>');
            const contentIds = extractXMLData('<contentid>(\\d+)</contentid>');
            const tels = extractXMLData('<tel>(?:<\\!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</tel>');
            const mapxs = extractXMLData('<mapx>([\\d\\.]+)</mapx>');
            const mapys = extractXMLData('<mapy>([\\d\\.]+)</mapy>');
            
            console.log(`  추출된 데이터:`);
            console.log(`    제목: ${titles.length}개`);
            console.log(`    주소: ${addresses.length}개`);
            console.log(`    이미지: ${images.length}개`);
            console.log(`    ID: ${contentIds.length}개`);
            
            if (titles.length > 0) {
                const xmlItems = titles.map((title, index) => ({
                    contentid: contentIds[index] || `xml_${Date.now()}_${index}`,
                    title: title || `${region} ${category} ${index + 1}`,
                    addr1: addresses[index] || `${region} 지역`,
                    tel: tels[index] || '',
                    firstimage: images[index] || '',
                    mapx: mapxs[index] || '',
                    mapy: mapys[index] || ''
                }));
                
                console.log(`🎉 XML 데이터 추출 성공: ${xmlItems.length}개 항목`);
                console.log(`  첫 번째 아이템:`, JSON.stringify(xmlItems[0], null, 2));
                
                const transformedData = convertToTourismFormat(xmlItems, region, category);
                
                return {
                    success: true,
                    method: `${strategyName}_xml`,
                    data: transformedData
                };
            } else {
                console.log(`⚠️ XML에서 제목 데이터를 찾을 수 없음`);
            }
        } else {
            console.log(`❌ XML 오류 코드 또는 데이터 없음`);
        }
        
        return { success: false, error: 'XML 데이터 없음', data: [] };
        
    } catch (error) {
        console.log(`❌ XML 처리 오류 (${strategyName}):`, error.message);
        return { success: false, error: 'XML 처리 실패', data: [] };
    }
}

// ===== 데이터 변환 함수 =====
function convertToTourismFormat(data, region, category) {
    const items = Array.isArray(data) ? data : [data];
    
    console.log(`🔄 데이터 변환 시작: ${items.length}개 항목 → ${category} 형식으로`);

    const transformedItems = items.map((item, index) => {
        const transformed = {
            id: item.contentid || item.id || `${category}_${Date.now()}_${index}`,
            title: cleanTitle(item.title || item.name || `${region} ${category} ${index + 1}`),
            category: category,
            address: item.addr1 || item.address || item.location || `${region} 지역`,
            tel: item.tel || item.phone || '정보 없음',
            image: validateImageUrl(item.firstimage || item.image),
            coordinates: {
                x: parseFloat(item.mapx) || null,
                y: parseFloat(item.mapy) || null
            },
            overview: item.overview ? item.overview.substring(0, 200) + '...' : null,
            realTimeData: {
                source: 'korean_tourism_organization',
                retrievedAt: new Date().toISOString(),
                contentType: category,
                isReal: true
            }
        };
        
        // 카테고리별 특화 데이터 추가
        if (category === 'festivals') {
            transformed.eventInfo = {
                startDate: item.eventstartdate || '',
                endDate: item.eventenddate || '',
                eventPlace: item.eventplace || '',
                sponsor: item.sponsor1 || ''
            };
        }
        
        return transformed;
    });

    console.log(`✅ 데이터 변환 완료: ${transformedItems.length}개`);
    console.log(`  이미지 있는 항목: ${transformedItems.filter(item => item.image).length}개`);
    console.log(`  좌표 있는 항목: ${transformedItems.filter(item => item.coordinates.x && item.coordinates.y).length}개`);
    
    return transformedItems;
}

// ===== 유틸리티 함수들 =====

// 제목 정리
function cleanTitle(title) {
    return title.replace(/^\[.*?\]\s*/, '').replace(/\s+/g, ' ').trim();
}

// 이미지 URL 검증
function validateImageUrl(url) {
    if (!url || url === '') return null;
    if (url.startsWith('http')) return url;
    return null;
}

// 현재 날짜 (YYYYMMDD)
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 미래 날짜 (일 수 더하기)
function getFutureDate(days) {
    const future = new Date();
    future.setDate(future.getDate() + days);
    const year = future.getFullYear();
    const month = String(future.getMonth() + 1).padStart(2, '0');
    const day = String(future.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 슬립 함수
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
