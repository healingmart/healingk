// api/detail.js (관광지 상세 정보 API)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { contentId, contentTypeId } = req.query;
        
        if (!contentId) {
            return res.status(400).json({ 
                success: false, 
                message: 'contentId가 필요합니다' 
            });
        }

        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다' 
            });
        }

        // ===== 성공 공식 적용: 병렬 호출 =====
        const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
        const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
        
        const [commonRes, introRes] = await Promise.all([
            fetch(commonUrl),
            fetch(introUrl)
        ]);
        
        const [commonData, introData] = await Promise.all([
            commonRes.json(),
            introRes.json()
        ]);

        let detailInfo = {
            contentId: contentId,
            contentTypeId: contentTypeId,
            common: null,
            intro: null,
            completeness: 20
        };

        // ===== DetailCommon 처리 =====
        const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
        if (commonCode === '0' || commonCode === '0000') {
            const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
            if (commonItem) {
                const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                detailInfo.common = {
                    title: itemData.title || null,
                    overview: itemData.overview || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                    addr1: itemData.addr1 || null,
                    addr2: itemData.addr2 || null,
                    zipcode: itemData.zipcode || null,
                    usetime: itemData.usetime || null,
                    parking: itemData.parking || null,
                    usefee: itemData.usefee || null,
                    restdate: itemData.restdate || null,
                    infocenter: itemData.infocenter || null,
                    firstimage: itemData.firstimage || null,
                    firstimage2: itemData.firstimage2 || null
                };
                
                // 완성도 계산
                if (detailInfo.common.overview) detailInfo.completeness += 30;
                if (detailInfo.common.tel) detailInfo.completeness += 10;
                if (detailInfo.common.homepage) detailInfo.completeness += 15;
                if (detailInfo.common.usetime) detailInfo.completeness += 10;
                if (detailInfo.common.firstimage) detailInfo.completeness += 5;
            }
        }

        // ===== DetailIntro 처리 =====
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                
                // 콘텐츠 타입별 특화 정보
                if (contentTypeId === '32') { // 숙박
                    detailInfo.intro = {
                        type: '숙박',
                        roomcount: itemData.roomcount || null,
                        checkintime: itemData.checkintime || null,
                        checkouttime: itemData.checkouttime || null,
                        roomtype: itemData.roomtype || null,
                        accomount: itemData.accomount || null,
                        benikia: itemData.benikia || null,
                        goodstay: itemData.goodstay || null,
                        hanok: itemData.hanok || null,
                        subfacility: itemData.subfacility || null,
                        barbecue: itemData.barbecue || null,
                        beauty: itemData.beauty || null,
                        bicycle: itemData.bicycle || null,
                        campfire: itemData.campfire || null,
                        fitness: itemData.fitness || null,
                        karaoke: itemData.karaoke || null,
                        publicbath: itemData.publicbath || null,
                        publicpc: itemData.publicpc || null,
                        sauna: itemData.sauna || null,
                        seminar: itemData.seminar || null,
                        sports: itemData.sports || null,
                        refundregulation: itemData.refundregulation || null
                    };
                    if (detailInfo.intro.roomcount) detailInfo.completeness += 10;
                    if (detailInfo.intro.checkintime) detailInfo.completeness += 5;
                    if (detailInfo.intro.roomtype) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '39') { // 음식점
                    detailInfo.intro = {
                        type: '음식점',
                        firstmenu: itemData.firstmenu || null,
                        treatmenu: itemData.treatmenu || null,
                        smoking: itemData.smoking || null,
                        packing: itemData.packing || null,
                        opentimefood: itemData.opentimefood || null,
                        restdatefood: itemData.restdatefood || null,
                        discountinfofood: itemData.discountinfofood || null,
                        kidsfacility: itemData.kidsfacility || null,
                        seat: itemData.seat || null,
                        lcnsno: itemData.lcnsno || null
                    };
                    if (detailInfo.intro.treatmenu) detailInfo.completeness += 15;
                    if (detailInfo.intro.opentimefood) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '12') { // 관광지
                    detailInfo.intro = {
                        type: '관광지',
                        heritage1: itemData.heritage1 || null,
                        heritage2: itemData.heritage2 || null,
                        heritage3: itemData.heritage3 || null,
                        expguide: itemData.expguide || null,
                        expagerange: itemData.expagerange || null,
                        accomcount: itemData.accomcount || null,
                        useseason: itemData.useseason || null,
                        usetime: itemData.usetime || null,
                        parking: itemData.parking || null,
                        chkbabycarriage: itemData.chkbabycarriage || null,
                        chkpet: itemData.chkpet || null,
                        chkcreditcard: itemData.chkcreditcard || null
                    };
                    if (detailInfo.intro.expguide) detailInfo.completeness += 10;
                    if (detailInfo.intro.useseason) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '14') { // 문화시설
                    detailInfo.intro = {
                        type: '문화시설',
                        scale: itemData.scale || null,
                        usefee: itemData.usefee || null,
                        usetime: itemData.usetime || null,
                        restdate: itemData.restdate || null,
                        parkingfee: itemData.parkingfee || null,
                        discountinfo: itemData.discountinfo || null,
                        spendtime: itemData.spendtime || null,
                        chkbabycarriage: itemData.chkbabycarriage || null,
                        chkpet: itemData.chkpet || null,
                        chkcreditcard: itemData.chkcreditcard || null
                    };
                    if (detailInfo.intro.scale) detailInfo.completeness += 10;
                    if (detailInfo.intro.usefee) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '15') { // 축제/공연/행사
                    detailInfo.intro = {
                        type: '축제/행사',
                        sponsor1: itemData.sponsor1 || null,
                        sponsor1tel: itemData.sponsor1tel || null,
                        sponsor2: itemData.sponsor2 || null,
                        sponsor2tel: itemData.sponsor2tel || null,
                        eventenddate: itemData.eventenddate || null,
                        eventstartdate: itemData.eventstartdate || null,
                        eventplace: itemData.eventplace || null,
                        eventhomepage: itemData.eventhomepage || null,
                        agelimit: itemData.agelimit || null,
                        bookingplace: itemData.bookingplace || null,
                        placeinfo: itemData.placeinfo || null,
                        subevent: itemData.subevent || null,
                        program: itemData.program || null,
                        spendtimefestival: itemData.spendtimefestival || null,
                        usetimefestival: itemData.usetimefestival || null
                    };
                    if (detailInfo.intro.eventstartdate) detailInfo.completeness += 10;
                    if (detailInfo.intro.eventplace) detailInfo.completeness += 5;
                    if (detailInfo.intro.program) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '25') { // 여행코스
                    detailInfo.intro = {
                        type: '여행코스',
                        distance: itemData.distance || null,
                        infocentertourcourse: itemData.infocentertourcourse || null,
                        schedule: itemData.schedule || null,
                        taketime: itemData.taketime || null,
                        theme: itemData.theme || null
                    };
                    if (detailInfo.intro.schedule) detailInfo.completeness += 15;
                    if (detailInfo.intro.taketime) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '28') { // 레포츠
                    detailInfo.intro = {
                        type: '레포츠',
                        accomcountleports: itemData.accomcountleports || null,
                        chkbabycarriageleports: itemData.chkbabycarriageleports || null,
                        chkcreditcardleports: itemData.chkcreditcardleports || null,
                        chkpetleports: itemData.chkpetleports || null,
                        expagerangeleports: itemData.expagerangeleports || null,
                        infocenterleports: itemData.infocenterleports || null,
                        openperiod: itemData.openperiod || null,
                        parkingfeeleports: itemData.parkingfeeleports || null,
                        parkingleports: itemData.parkingleports || null,
                        reservation: itemData.reservation || null,
                        restdateleports: itemData.restdateleports || null,
                        scaleleports: itemData.scaleleports || null,
                        usefeeleports: itemData.usefeeleports || null,
                        usetimeleports: itemData.usetimeleports || null
                    };
                    if (detailInfo.intro.usefeeleports) detailInfo.completeness += 10;
                    if (detailInfo.intro.usetimeleports) detailInfo.completeness += 5;
                    
                } else if (contentTypeId === '38') { // 쇼핑
                    detailInfo.intro = {
                        type: '쇼핑',
                        chkbabycarriageshopping: itemData.chkbabycarriageshopping || null,
                        chkcreditcardshopping: itemData.chkcreditcardshopping || null,
                        chkpetshopping: itemData.chkpetshopping || null,
                        culturecenter: itemData.culturecenter || null,
                        fairday: itemData.fairday || null,
                        infocentershopping: itemData.infocentershopping || null,
                        opendateshopping: itemData.opendateshopping || null,
                        opentime: itemData.opentime || null,
                        parkingshopping: itemData.parkingshopping || null,
                        restdateshopping: itemData.restdateshopping || null,
                        restroom: itemData.restroom || null,
                        saleitem: itemData.saleitem || null,
                        saleitemcost: itemData.saleitemcost || null,
                        scaleshopping: itemData.scaleshopping || null,
                        shopguide: itemData.shopguide || null
                    };
                    if (detailInfo.intro.saleitem) detailInfo.completeness += 10;
                    if (detailInfo.intro.opentime) detailInfo.completeness += 5;
                }
            }
        }

        // 최대 완성도 제한
        detailInfo.completeness = Math.min(detailInfo.completeness, 100);

        return res.status(200).json({
            success: true,
            data: detailInfo,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('상세 정보 API 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
