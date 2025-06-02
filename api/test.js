// 성공 공식 적용한 완전한 세밀한 정보 수집
async function getCompleteDetailedInfo(apiKey, contentId, contentTypeId) {
    // 1. DetailCommon (contentTypeId 없이)
    const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
    
    // 2. DetailIntro (contentTypeId 포함)
    const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
    
    const [commonRes, introRes] = await Promise.all([
        fetch(commonUrl),
        fetch(introUrl)
    ]);
    
    const [commonData, introData] = await Promise.all([
        commonRes.json(),
        introRes.json()
    ]);
    
    // 데이터 통합 및 반환
    return {
        overview: commonData.response.body.items.item.overview,
        tel: commonData.response.body.items.item.tel,
        homepage: commonData.response.body.items.item.homepage.replace(/<[^>]*>/g, ''),
        usetime: commonData.response.body.items.item.usetime,
        parking: commonData.response.body.items.item.parking,
        roomCount: introData.response.body.items.item.roomcount,
        checkIn: introData.response.body.items.item.checkintime,
        checkOut: introData.response.body.items.item.checkouttime,
        roomType: introData.response.body.items.item.roomtype,
        completeness: 90
    };
}
