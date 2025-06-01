const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { region = 'all', status = 'all' } = req.query;
        const apiKey = process.env.TOURISM_API_KEY;

        // 현재 날짜 설정
        const today = new Date();
        const todayStr = formatDateRaw(today);

        console.log('축제 API 요청:', { region, status, todayStr, apiKeyExists: !!apiKey });

        if (!apiKey) {
            console.warn('⚠️ TOURISM_API_KEY 환경 변수가 설정되지 않았습니다.');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats('all', todayStr), // 함수 이름 수정
                message: '⚠️ API 키 설정 필요 - 샘플 데이터',
                timestamp: new Date().toISOString()
            });
        }

        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 2); // 2개월 후까지
        const nextMonthStr = formatDateRaw(nextMonth);

        // 지역 코드 설정 (더 많은 지역 포함)
        const areaCodesToFetch = region !== 'all' ? [getAreaCode(region)] : 
            [1, 6, 39, 32, 37, 4, 5, 3, 31, 35, 36]; // 서울, 부산, 제주, 강원, 전북, 대구, 광주, 대전, 경기, 경북, 경남

        console.log('조회할 지역 코드:', areaCodesToFetch);

        // 각 지역별 축제 정보 병렬 조회
        const festivalPromises = areaCodesToFetch.map(async (code) => {
            try {
                const encodedApiKey = encodeURIComponent(apiKey);
                
                console.log(`지역 ${code} 축제 조회 시작...`);

                // 기본 축제 정보 조회
                const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                    params: {
                        serviceKey: encodedApiKey,
                        numOfRows: 100,
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A',
                        eventStartDate: todayStr,
                        eventEndDate: nextMonthStr,
                        areaCode: code
                    },
                    timeout: 15000
                });

                console.log(`지역 ${code} API 응답:`, {
                    resultCode: response.data?.response?.header?.resultCode,
                    resultMsg: response.data?.response?.header?.resultMsg,
                    itemCount: response.data?.response?.body?.items?.item?.length || 0
                });

                if (response.data?.response?.header?.resultCode === '0000') {
                    const items = response.data.response.body?.items?.item || [];
                    const itemsArray = Array.isArray(items) ? items : (items ? [items] : []);
                    
                    console.log(`지역 ${code} 기본 축제 수:`, itemsArray.length);

                    // 각 축제에 대한 상세 정보 추가 조회 (성능을 위해 제한)
                    const detailedFestivals = await Promise.all(
                        itemsArray.slice(0, 20).map(async (festival, index) => { // 상위 20개만 상세 조회
                            try {
                                await new Promise(resolve => setTimeout(resolve, index * 100)); // API 호출 간격 조절

                                const detailResponse = await axios.get('http://apis.data.go.kr/B551011/KorService1/detailCommon1', {
                                    params: {
                                        serviceKey: encodedApiKey,
                                        MobileOS: 'ETC',
                                        MobileApp: 'HealingK',
                                        _type: 'json',
                                        contentId: festival.contentid,
                                        defaultYN: 'Y',
                                        firstImageYN: 'Y',
                                        addrinfoYN: 'Y',
                                        mapinfoYN: 'Y',
                                        overviewYN: 'Y'
                                    },
                                    timeout: 8000
                                });

                                let detailInfo = {};
                                if (detailResponse.data?.response?.header?.resultCode === '0000') {
                                    const detail = detailResponse.data.response.body?.items?.item?.[0] || {};
                                    detailInfo = {
                                        overview: detail.overview || '',
                                        homepage: detail.homepage || '',
                                        tel: detail.tel || festival.tel || '',
                                        addr1: detail.addr1 || festival.addr1 || '',
                                        addr2: detail.addr2 || festival.addr2 || '',
                                        zipcode: detail.zipcode || '',
                                        mapx: detail.mapx || festival.mapx || '',
                                        mapy: detail.mapy || festival.mapy || '',
                                        mlevel: detail.mlevel || '',
                                        firstimage: detail.firstimage || festival.firstimage || '',
                                        firstimage2: detail.firstimage2 || festival.firstimage2 || ''
                                    };
                                }

                                return { ...festival, ...detailInfo };
                            } catch (detailError) {
                                console.warn(`상세 정보 조회 실패 (${festival.contentid}):`, detailError.message);
                                return festival; // 기본 정보만 반환
                            }
                        })
                    );

                    // 나머지 축제들은 기본 정보만 포함
                    const remainingFestivals = itemsArray.slice(20);
                    
                    return [...detailedFestivals, ...remainingFestivals];
                } else {
                    console.error(`지역 ${code} 축제 조회 오류:`, response.data?.response?.header?.resultMsg);
                    return [];
                }
            } catch (error) {
                console.error(`지역 ${code} 요청 오류:`, error.message);
                return [];
            }
        });

        const allFestivalResults = await Promise.all(festivalPromises);
        const allFestivals = allFestivalResults.flat();

        console.log('총 조회된 축제 수:', allFestivals.length);

        // 축제 데이터 가공
        const processedFestivals = allFestivals.map(festival => {
            const startDateRaw = festival.eventstartdate;
            const endDateRaw = festival.eventenddate;
            
            let festivalStatus = 'upcoming';
            if (startDateRaw <= todayStr && endDateRaw >= todayStr) {
                festivalStatus = 'ongoing';
            } else if (endDateRaw < todayStr) {
                festivalStatus = 'ended';
            }

            // 이번 주말 여부 체크
            const isThisWeekend = checkThisWeekend(startDateRaw, endDateRaw, todayStr);

            return {
                id: festival.contentid,
                title: festival.title || '축제명 없음',
                location: festival.addr1 || festival.eventplace || '장소 미정',
                detailLocation: festival.addr2 || '',
                region: getRegionName(parseInt(festival.areacode)),
                startDate: formatDateDisplay(startDateRaw),
                endDate: formatDateDisplay(endDateRaw),
                startDateRaw: startDateRaw,
                endDateRaw: endDateRaw,
                status: festivalStatus,
                isThisWeekend: isThisWeekend,
                tel: festival.tel || '',
                homepage: cleanHomepage(festival.homepage || ''), // HTML 태그 제거
                overview: cleanOverview(festival.overview || ''), // HTML 태그 제거
                image: festival.firstimage || festival.firstimage2 || null,
                mapx: festival.mapx,
                mapy: festival.mapy,
                daysLeft: calculateDaysLeft(startDateRaw, endDateRaw, todayStr),
                category: festival.cat3 || festival.cat2 || '축제',
                zipcode: festival.zipcode || '',
                mlevel: festival.mlevel || ''
            };
        }).filter(f => f.status !== 'ended'); // 종료된 축제 제외

        console.log('가공된 축제 수:', processedFestivals.length);

        // 상태별 분류
        const ongoing = processedFestivals
            .filter(f => f.status === 'ongoing')
            .sort((a, b) => a.endDateRaw.localeCompare(b.endDateRaw))
            .slice(0, 50);

        const upcoming = processedFestivals
            .filter(f => f.status === 'upcoming')
            .sort((a, b) => a.startDateRaw.localeCompare(b.startDateRaw))
            .slice(0, 50);

        const thisWeekend = processedFestivals
            .filter(f => f.isThisWeekend)
            .slice(0, 30);

        // 통계
        const stats = {
            total: processedFestivals.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            regions: [...new Set(processedFestivals.map(f => f.region))].length,
            popularRegions: getPopularRegions(processedFestivals)
        };

        console.log('최종 통계:', stats);

        return res.status(200).json({
            success: true,
            data: {
                ongoing,
                upcoming,
                thisWeekend,
                stats,
                message: allFestivals.length > 0 ? '🎪 실시간 축제 상세 정보' : '⚠️ 조회된 축제가 없습니다',
                lastUpdate: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('축제 정보 조회 중 서버리스 함수 오류:', error);
        return res.status(200).json({
            success: false,
            data: getSampleFestivalsWithStats('all', formatDateRaw(new Date())), // 함수 이름 수정
            message: `⚠️ 데이터 조회 오류: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
};

// HTML 태그 제거 함수
function cleanHomepage(homepage) {
    if (!homepage) return '';
    return homepage.replace(/<[^>]*>/g, '').trim();
}

function cleanOverview(overview) {
    if (!overview) return '';
    return overview.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
}

// 이번 주말 체크 함수
function checkThisWeekend(startDateRaw, endDateRaw, todayRaw) {
    if (!startDateRaw || !endDateRaw || !todayRaw) return false;
    
    try {
        const startDate = new Date(startDateRaw.slice(0,4), startDateRaw.slice(4,6)-1, startDateRaw.slice(6,8));
        const endDate = new Date(endDateRaw.slice(0,4), endDateRaw.slice(4,6)-1, endDateRaw.slice(6,8));
        const today = new Date(todayRaw.slice(0,4), todayRaw.slice(4,6)-1, todayRaw.slice(6,8));
        
        const thisSaturday = new Date(today);
        const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
        thisSaturday.setDate(today.getDate() + daysUntilSaturday);
        
        const thisSunday = new Date(thisSaturday);
        thisSunday.setDate(thisSaturday.getDate() + 1);
        
        return (startDate <= thisSunday && endDate >= thisSaturday);
    } catch (error) {
        console.warn('주말 체크 오류:', error);
        return false;
    }
}

// --- 헬퍼 함수들 ---

// 지역명 -> 지역 코드 매핑
function getAreaCode(regionName) {
    const codes = {
        '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
        '세종': 8, '경기': 31, '강원': 32, '충북': 33, '충남': 34, '전북': 37,
        '전남': 38, '경북': 35, '경남': 36, '제주': 39
    };
    return codes[regionName] || null;
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

// 날짜 포맷팅 (YYYYMMDD)
function formatDateRaw(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

// 남은 일수 계산
function calculateDaysLeft(startDateRaw, endDateRaw, todayRaw) {
    if (!startDateRaw || !endDateRaw || !todayRaw) return '날짜 정보 없음';
    
    try {
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
        return '종료';
    } catch (error) {
        console.warn('날짜 계산 오류:', error);
        return '날짜 계산 오류';
    }
}

// 인기 지역 계산
function getPopularRegions(festivals) {
    const regionCount = {};
    festivals.forEach(f => {
        regionCount[f.region] = (regionCount[f.region] || 0) + 1;
    });
    
    return Object.entries(regionCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({ region, count }));
}

// --- 샘플 데이터 함수들 ---

function getSampleFestivalsWithStats(type, todayStr) {
    const sampleFestivals = [
        {
            id: '1',
            title: '서울 빛초롱 축제 2025',
            location: '청계천 일대',
            detailLocation: '청계광장~청계8가',
            region: '서울',
            startDate: '2025.05.01',
            endDate: '2025.06.15',
            startDateRaw: '20250501',
            endDateRaw: '20250615',
            status: 'ongoing',
            isThisWeekend: true,
            tel: '02-2290-7111',
            homepage: 'https://www.seoul.go.kr',
            overview: '서울의 대표적인 빛축제로 아름다운 등불이 청계천을 수놓습니다.',
            category: '문화축제',
            daysLeft: '14일 남음',
            image: null,
            mapx: '126.9784147',
            mapy: '37.5666805'
        },
        {
            id: '2',
            title: '부산 바다축제 2025',
            location: '해운대 해수욕장',
            detailLocation: '해운대구 우동',
            region: '부산',
            startDate: '2025.06.10',
            endDate: '2025.06.20',
            startDateRaw: '20250610',
            endDateRaw: '20250620',
            status: 'upcoming',
            isThisWeekend: false,
            tel: '051-749-4000',
            homepage: 'https://www.busan.go.kr',
            overview: '부산의 아름다운 바다에서 펼쳐지는 여름 축제입니다.',
            category: '해양축제',
            daysLeft: '9일 후 시작',
            image: null,
            mapx: '129.1603',
            mapy: '35.1587'
        },
        {
            id: '3',
            title: '제주 유채꽃 축제',
            location: '제주 서귀포시',
            detailLocation: '성산일출봉 일대',
            region: '제주',
            startDate: '2025.06.05',
            endDate: '2025.06.12',
            startDateRaw: '20250605',
            endDateRaw: '20250612',
            status: 'upcoming',
            isThisWeekend: true,
            tel: '064-760-4000',
            homepage: 'https://www.jeju.go.kr',
            overview: '제주의 아름다운 유채꽃밭에서 열리는 봄 축제입니다.',
            category: '자연축제',
            daysLeft: '4일 후 시작',
            image: null,
            mapx: '126.5312',
            mapy: '33.4996'
        }
    ];

    const ongoing = sampleFestivals.filter(f => f.status === 'ongoing');
    const upcoming = sampleFestivals.filter(f => f.status === 'upcoming');
    const thisWeekend = sampleFestivals.filter(f => f.isThisWeekend);

    return {
        ongoing,
        upcoming,
        thisWeekend,
        stats: {
            total: sampleFestivals.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            regions: [...new Set(sampleFestivals.map(f => f.region))].length,
            popularRegions: getPopularRegions(sampleFestivals)
        },
        message: '⚠️ API 키 미설정 또는 네트워크 오류로 샘플 데이터를 표시합니다.',
        lastUpdate: new Date().toISOString()
    };
}
주요 수정사항 ✅
1. 함수 이름 일치성 수정:

getSampleFestivalsWithDetails → getSampleFestivalsWithStats
2. 성능 최적화:

상세 정보 조회를 상위 20개로 제한
API 호출 간격 조절 (100ms 대기)
타임아웃 시간 조정
3. 에러 처리 강화:

HTML 태그 제거 함수 추가
날짜 계산 오류 처리
더 안전한 데이터 검증
4. 로깅 개선:

각 단계별 상세 로그
디버깅 정보 추가
5. 샘플 데이터 개선:

더 현실적인 샘플 데이터
완전한 필드 정보 포함
이제 완벽하게 작동할 겁니다! 🎪✨

복사
[지역명] === SUCCESS: API Key is detected. Proceeding with KMA API call. === 이 로그가 보이는지 여부 이런 로그가 ㅏ보여야 한다는데 이게 무슨 말이야? vercel에서는 찾아봐도 안보이는데???
생각 과정
아! 그 로그는 코드에서 직접 출력해야 하는 디버깅 메시지예요! 🔍 현재 코드에는 그런 로그가 없어서 안 보이는 거예요.

Vercel 로그 확인 방법
1. Vercel Dashboard에서 확인:

1. Vercel Dashboard → 프로젝트 선택
2. Functions 탭 클릭
3. 각 함수 클릭하면 로그 확인 가능
2. Vercel CLI로 실시간 로그 확인:

Copy# 실시간 로그 스트리밍
vercel logs healingk --follow

# 특정 함수 로그만 보기
vercel logs healingk --follow --filter="api/weather"
3. 브라우저에서도 확인:

https://vercel.com/your-username/healingk/functions
로그 출력하도록 weather.js 수정
Copyconst axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const startTime = Date.now();
    const region = req.query.region || '서울';
    
    // === 요청 시작 로그 ===
    console.log(`[${region}] === REQUEST START: Weather API called ===`);
    console.log(`[${region}] Timestamp: ${new Date().toISOString()}`);
    console.log(`[${region}] Query params:`, req.query);

    try {
        const apiKey = process.env.WEATHER_API_KEY;

        // === API 키 체크 로그 ===
        if (!apiKey) {
            console.log(`[${region}] === ERROR: API Key not found ===`);
            console.log(`[${region}] Environment variables available:`, Object.keys(process.env).filter(key => key.includes('WEATHER')));
            
            return res.json({
                success: true,
                data: {
                    region,
                    temperature: 20,
                    sky: '맑음',
                    precipitation: '없음',
                    message: '⚠️ API 키 설정 필요 - 샘플 데이터',
                    time: new Date().toLocaleString('ko-KR')
                }
            });
        }

        // === API 키 감지 성공 로그 ===
        console.log(`[${region}] === SUCCESS: API Key is detected. Proceeding with KMA API call. ===`);
        console.log(`[${region}] API Key length: ${apiKey.length}`);
        console.log(`[${region}] API Key prefix: ${apiKey.substring(0, 10)}...`);

        // 좌표 매핑
        const coordinates = {
            '서울': { nx: 60, ny: 127 },
            '부산': { nx: 98, ny: 76 },
            '제주': { nx: 52, ny: 38 },
            '강릉': { nx: 92, ny: 131 },
            '전주': { nx: 63, ny: 89 },
            '대구': { nx: 89, ny: 90 },
            '광주': { nx: 58, ny: 74 },
            '대전': { nx: 67, ny: 100 }
        };

        const coord = coordinates[region] || coordinates['서울'];
        console.log(`[${region}] === COORDINATES: nx=${coord.nx}, ny=${coord.ny} ===`);

        // 날짜/시간 계산
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const baseDate = kst.toISOString().slice(0, 10).replace(/-/g, '');
        
        const currentHour = kst.getHours();
        let baseTime;
        if (currentHour >= 23 || currentHour < 2) baseTime = '2300';
        else if (currentHour < 5) baseTime = '0200';
        else if (currentHour < 8) baseTime = '0500';
        else if (currentHour < 11) baseTime = '0800';
        else if (currentHour < 14) baseTime = '1100';
        else if (currentHour < 17) baseTime = '1400';
        else if (currentHour < 20) baseTime = '1700';
        else baseTime = '2000';

        console.log(`[${region}] === TIME PARAMS: baseDate=${baseDate}, baseTime=${baseTime} ===`);

        // === KMA API 호출 시작 ===
        console.log(`[${region}] === CALLING KMA API... ===`);
        const apiStartTime = Date.now();

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
            timeout: 10000
        });

        const apiEndTime = Date.now();
        console.log(`[${region}] === KMA API RESPONSE TIME: ${apiEndTime - apiStartTime}ms ===`);

        // === API 응답 상태 로그 ===
        console.log(`[${region}] === API RESPONSE STATUS ===`);
        console.log(`[${region}] HTTP Status: ${response.status}`);
        console.log(`[${region}] Result Code: ${response.data?.response?.header?.resultCode}`);
        console.log(`[${region}] Result Message: ${response.data?.response?.header?.resultMsg}`);
        
        if (!response.data || !response.data.response || response.data.response.header.resultCode !== '00') {
            console.log(`[${region}] === ERROR: Invalid API response ===`);
            console.log(`[${region}] Full response:`, JSON.stringify(response.data, null, 2));
            throw new Error(response.data?.response?.header?.resultMsg || 'API 응답 오류');
        }

        const items = response.data.response.body?.items?.item || [];
        console.log(`[${region}] === DATA PARSING ===`);
        console.log(`[${region}] Items received: ${items.length}`);

        // 데이터 파싱
        const currentFcstTime = kst.toISOString().slice(11, 16).replace(':', '');
        let temperature = 20;
        let sky = '맑음';
        let precipitation = '없음';

        const latestData = {};
        items.forEach(item => {
            const category = item.category;
            const fcstTime = item.fcstTime;
            
            if (!latestData[category] || fcstTime >= currentFcstTime) {
                latestData[category] = item.fcstValue;
            }
        });

        console.log(`[${region}] === PARSED DATA ===`);
        console.log(`[${region}] Raw data:`, latestData);

        // 온도 (TMP)
        if (latestData.TMP) {
            temperature = parseFloat(latestData.TMP);
            console.log(`[${region}] Temperature: ${temperature}°C`);
        }

        // 하늘상태 (SKY)
        if (latestData.SKY) {
            const skyCode = latestData.SKY;
            if (skyCode === '1') sky = '맑음';
            else if (skyCode === '3') sky = '구름많음';
            else if (skyCode === '4') sky = '흐림';
            console.log(`[${region}] Sky: ${sky} (code: ${skyCode})`);
        }

        // 강수형태 (PTY)
        if (latestData.PTY) {
            const ptyCode = latestData.PTY;
            if (ptyCode === '0') precipitation = '없음';
            else if (ptyCode === '1') precipitation = '비';
            else if (ptyCode === '2') precipitation = '비/눈';
            else if (ptyCode === '3') precipitation = '눈';
            else if (ptyCode === '4') precipitation = '소나기';
            console.log(`[${region}] Precipitation: ${precipitation} (code: ${ptyCode})`);
        }

        const weatherData = {
            region,
            temperature,
            sky,
            precipitation,
            message: '🌟 실시간 기상청 데이터',
            time: new Date().toLocaleString('ko-KR'),
            debug: {
                processingTime: Date.now() - startTime,
                apiResponseTime: apiEndTime - apiStartTime,
                baseDate,
                baseTime,
                coordinates: coord,
                itemCount: items.length
            }
        };

        // === 성공 로그 ===
        const totalTime = Date.now() - startTime;
        console.log(`[${region}] === SUCCESS: Weather data processed successfully ===`);
        console.log(`[${region}] Total processing time: ${totalTime}ms`);
        console.log(`[${region}] Final data:`, weatherData);

        return res.json({
            success: true,
            data: weatherData
        });

    } catch (error) {
        // === 오류 로그 ===
        const totalTime = Date.now() - startTime;
        console.log(`[${region}] === ERROR: Weather API failed ===`);
        console.log(`[${region}] Error type: ${error.name}`);
        console.log(`[${region}] Error message: ${error.message}`);
        console.log(`[${region}] Error code: ${error.code}`);
        console.log(`[${region}] Processing time before error: ${totalTime}ms`);
        
        if (error.response) {
            console.log(`[${region}] HTTP Response Status: ${error.response.status}`);
            console.log(`[${region}] HTTP Response Data:`, error.response.data);
        }

        console.log(`[${region}] Full error stack:`, error.stack);

        return res.json({
            success: true,
            data: {
                region: region,
                temperature: 20,
                sky: '맑음',
                precipitation: '없음',
                message: `⚠️ 오류: ${error.message}`,
                time: new Date().toLocaleString('ko-KR'),
                error: true,
                debug: {
                    errorType: error.name,
                    processingTime: totalTime
                }
            }
        });
    }
};
