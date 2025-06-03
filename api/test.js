// api/alltourism.js (완전한 관광 정보 API)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { 
            keyword = '', 
            contentTypeId = '', 
            areaCode = '', 
            numOfRows = '10',
            pageNo = '1',
            detailed = 'true' 
        } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다' 
            });
        }

        let searchUrl;
        
        if (keyword) {
            // 키워드 검색
            searchUrl = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&keyword=${encodeURIComponent(keyword)}&numOfRows=${numOfRows}&pageNo=${pageNo}`;
            if (contentTypeId) searchUrl += `&contentTypeId=${contentTypeId}`;
            if (areaCode) searchUrl += `&areaCode=${areaCode}`;
        } else {
            // 지역별 검색
            searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}`;
            if (contentTypeId) searchUrl += `&contentTypeId=${contentTypeId}`;
            if (areaCode) searchUrl += `&areaCode=${areaCode}`;
        }

        const response = await fetch(searchUrl);
        const data = await response.json();
        
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        
        if (resultCode !== '0' && resultCode !== '0000') {
            return res.status(400).json({
                success: false,
                message: '데이터 조회 실패',
                error: data.response?.header?.resultMsg || '알 수 없는 오류'
            });
        }

        const items = data.response?.body?.items?.item || [];
        const itemList = Array.isArray(items) ? items : [items];
        
        let tourismData = itemList.map(item => ({
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            title: item.title,
            addr1: item.addr1,
            addr2: item.addr2,
            tel: item.tel || null,
            firstimage: item.firstimage || null,
            mapx: item.mapx || null,
            mapy: item.mapy || null,
            mlevel: item.mlevel || null,
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null
        }));

        // 상세 정보 추가 (detailed=true인 경우)
        if (detailed === 'true' && tourismData.length > 0) {
            // 처음 5개 항목에 대해서만 상세 정보 수집 (성능 고려)
            const detailedItems = tourismData.slice(0, 5);
            
            const detailedData = await Promise.all(
                detailedItems.map(async (item) => {
                    try {
                        const detailInfo = await getDetailedInfo(apiKey, item.contentId, item.contentTypeId);
                        return {
                            ...item,
                            detailed: detailInfo
                        };
                    } catch (error) {
                        return {
                            ...item,
                            detailed: { error: error.message, completeness: 20 }
                        };
                    }
                })
            );
            
            // 상세 정보가 포함된 항목들과 기본 정보만 있는 나머지 항목들 합치기
            tourismData = [...detailedData, ...tourismData.slice(5)];
        }

        return res.status(200).json({
            success: true,
            data: {
                items: tourismData,
                totalCount: data.response?.body?.totalCount || tourismData.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows)
            },
            searchParams: {
                keyword,
                contentTypeId,
                areaCode,
                detailed
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('관광 정보 API 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// 성공 공식이 적용된 상세 정보 수집 함수
async function getDetailedInfo(apiKey, contentId, contentTypeId) {
    const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
    const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
    
    const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
    const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
    
    let detailed = { completeness: 20 };
    
    // DetailCommon 처리
    const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
    if (commonCode === '0' || commonCode === '0000') {
        const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
        if (commonItem) {
            const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
            detailed.common = {
                overview: itemData.overview || null,
                tel: itemData.tel || null,
                homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                usetime: itemData.usetime || null,
                parking: itemData.parking || null,
                usefee: itemData.usefee || null
            };
            
            if (detailed.common.overview) detailed.completeness += 30;
            if (detailed.common.tel) detailed.completeness += 10;
            if (detailed.common.homepage) detailed.completeness += 10;
            if (detailed.common.usetime) detailed.completeness += 10;
        }
    }
    
    // DetailIntro 처리
    const introCode = introData.resultCode || introData.response?.header?.resultCode;
    if (introCode === '0' || introCode === '0000') {
        const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
        if (introItem) {
            const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
            
            if (contentTypeId === '32') { // 숙박
                detailed.intro = {
                    type: '숙박',
                    roomCount: itemData.roomcount || null,
                    checkIn: itemData.checkintime || null,
                    checkOut: itemData.checkouttime || null,
                    roomType: itemData.roomtype || null
                };
                if (detailed.intro.roomCount) detailed.completeness += 10;
                if (detailed.intro.checkIn) detailed.completeness += 5;
                if (detailed.intro.roomType) detailed.completeness += 5;
                
            } else if (contentTypeId === '39') { // 음식점
                detailed.intro = {
                    type: '음식점',
                    treatMenu: itemData.treatmenu || null,
                    openTime: itemData.opentimefood || null,
                    restDate: itemData.restdatefood || null,
                    firstMenu: itemData.firstmenu || null,
                    packing: itemData.packing || null
                };
                if (detailed.intro.treatMenu) detailed.completeness += 15;
                if (detailed.intro.openTime) detailed.completeness += 5;
                
            } else if (contentTypeId === '12') { // 관광지
                detailed.intro = {
                    type: '관광지',
                    expguide: itemData.expguide || null,
                    heritage1: itemData.heritage1 || null,
                    useseason: itemData.useseason || null,
                    accomcount: itemData.accomcount || null
                };
                if (detailed.intro.expguide) detailed.completeness += 10;
                if (detailed.intro.heritage1 && detailed.intro.heritage1 !== '0') detailed.completeness += 10;
                
            } else if (contentTypeId === '15') { // 축제
                detailed.intro = {
                    type: '축제',
                    eventStart: itemData.eventstartdate || null,
                    eventEnd: itemData.eventenddate || null,
                    eventPlace: itemData.eventplace || null,
                    program: itemData.program || null
                };
                if (detailed.intro.eventStart) detailed.completeness += 10;
                if (detailed.intro.eventPlace) detailed.completeness += 5;
                if (detailed.intro.program) detailed.completeness += 5;
            }
        }
    }
    
    detailed.completeness = Math.min(detailed.completeness, 100);
    return detailed;
}
